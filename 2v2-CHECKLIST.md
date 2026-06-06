# 2v2 Mode Implementation Checklist

## Phase 1: Data Types & Protocol

### 1.1 Update `src/lib/game-types.ts`
- [ ] Add `type Role = "farmer" | "seller"`
- [ ] Add `interface Cargo { cropId: CropId; position: { x: number; y: number }; owner_playerId: string; createdAt: number }`
- [ ] Extend `PublicPlayer` with:
  - `role: Role`
  - `carrying_cargo?: Cargo`
  - `teamId?: string`
- [ ] Add `interface MatchTeam { id: string; players: string[]; coins: number }`
- [ ] Update `PublicMatchState` to include `teams: MatchTeam[]` instead of per-player coins
- [ ] Add `MARKET_TILE_POS = { x: 11, y: 9 }` constant for market location

### 1.2 Update `src/lib/match-protocol.ts`
- [ ] Add client messages:
  - `{ type: "swap_role"; targetTeammateId: string }`
  - `{ type: "pick_up"; pos: { x; y } }` (seller action)
  - `{ type: "sell_cargo"; pos: { x; y } }` (at market tile)
- [ ] Extend `ServerEvent` union with:
  - `{ kind: "cargo_created"; pos: { x; y }; cropId: CropId; reward: number; createdAt: number }`
  - `{ kind: "cargo_sold"; playerId: string; reward: number; distance: number; teamId: string }`
  - `{ kind: "role_swapped"; playerId1: string; playerId2: string }`
- [ ] Update room settings type with `mode: "1v1" | "2v2"` (optional)

---

## Phase 2: Server Logic (Durable Object)

### 2.1 Setup 4-Player Support in `worker/match/src/match-do.ts`
- [ ] Change `maxPlayers: 2` → `maxPlayers: 4`
- [ ] Update join logic:
  - First 2 players → TeamA
  - Next 2 players → TeamB
  - Store `team_id` on player
- [ ] Add `teams: MatchTeam[]` to `StoredRoomState`
- [ ] Initialize team coins to 0 on match start
- [ ] Update `PublicMatchState` to expose teams instead of individual player coins

### 2.2 Cargo Lifecycle Logic
- [ ] Add `fieldCargo: Cargo[]` to `StoredRoomState` (tracks all active cargo on field)
- [ ] **On harvest** (when farmer harvests ripe crop):
  - Create `Cargo` object with `{ cropId, position: tile, owner_playerId, createdAt: now }`
  - Push to `fieldCargo`
  - Emit `ServerEvent { kind: "cargo_created"; ... }`
  - **DO NOT** credit coins yet (farmers don't earn from harvest in 2v2)
  - Note: Base coins still awarded, but via "cargo_sold" when seller delivers
- [ ] Add cargo wilt check (every GROWTH_INTERVAL):
  - Remove cargo that is >10 seconds old (without being picked up)
  - Emit event indicating cargo spoiled

### 2.3 Seller Actions
- [ ] **pick_up handler**:
  - Validate `playerId` is seller role
  - Find cargo at `pos`
  - Move cargo to `player.carrying_cargo`
  - Remove from `fieldCargo`
  - Emit event
- [ ] **sell_cargo handler** (called when seller at market tile):
  - Validate player at market tile position (MARKET_TILE_POS)
  - Validate player has `carrying_cargo`
  - Calculate distance: `distance = sqrt((cargo.x - market.x)² + (cargo.y - market.y)²)`
  - Calculate reward: `basePrice × (1 + 0.1 × distance)` (round)
  - Add to team coins (not player coins)
  - Emit `ServerEvent { kind: "cargo_sold"; ... }`
  - Clear `carrying_cargo`

### 2.4 Role Swap
- [ ] Add **swap_role handler**:
  - Validate `playerId` is farmer role
  - Validate `targetTeammateId` is on same team and is farmer role
  - Validate current phase is NOT "playing" (only between phases)
  - Swap: `player1.role ↔ player2.role`
  - Emit `ServerEvent { kind: "role_swapped"; ... }`
  - Broadcast new state

### 2.5 Team Coin Tracking
- [ ] Update all coin credit logic to write to `teams[teamIndex].coins` instead of `player.coins`
- [ ] On match end, determine winner by `teams[0].coins > teams[1].coins`
- [ ] Keep player-level stats if needed (personal harvest count) but coins are team-level

---

## Phase 3: Client Logic

### 3.1 Update `src/components/MultiplayerGame.tsx`
- [ ] **UI updates**:
  - Display team coins at top (e.g., "Team A: 250 / 500")
  - Add role badge next to each player name (🌱 farmer / 🛒 seller)
  - Show player's carrying_cargo state visually (cargo indicator on sprite)
- [ ] **Farmer controls** (unchanged from 1v1):
  - hoe, water, plant, harvest actions available
  - Hide/disable pick_up and sell_cargo
- [ ] **Seller controls** (new):
  - Hide/disable hoe, water, plant, harvest
  - Enable pick_up action (interact with cargo on field)
  - Enable sell_cargo action (interact at market tile)
- [ ] **Role swap UI**:
  - Add button "Request Role Swap" during phase transitions
  - Hidden during "playing" phase
  - Clicking shows modal: "Swap roles with [teammate name]?"
- [ ] Render market tile at field edge (special sprite/color)

### 3.2 Update `src/lib/match-client.ts`
- [ ] **On `ServerEvent { kind: "cargo_created" }`**:
  - Create visual cargo sprite on field at (x, y)
  - Show floating popup with crop icon + reward value
  - Schedule auto-remove after 10s if not picked up (wilt animation)
- [ ] **On `ServerEvent { kind: "cargo_sold" }`**:
  - Play selling VFX at seller position
  - Show "+X coins" popup
  - Update team score display
  - Play success sound
- [ ] **On `ServerEvent { kind: "role_swapped" }`**:
  - Update local player state roles
  - Update UI to reflect new controls
  - Show notification "Roles swapped!"

### 3.3 Network Message Sending
- [ ] Add client message handlers:
  - `on_pick_up()` → send `{ type: "pick_up"; pos }`
  - `on_sell_cargo()` → send `{ type: "sell_cargo"; pos }` (when at market)
  - `on_request_swap(teammate_id)` → send `{ type: "swap_role"; targetTeammateId }`

---

## Phase 4: Settings & Configuration

### 4.1 Room Settings
- [ ] Add `mode: "1v1" | "2v2"` selector in room creation UI
- [ ] Auto-detect mode based on player count or explicit setting
- [ ] Adjust default `targetCoins`:
  - 1v1: 500
  - 2v2: 800 (higher since 2 farmers generate income)
- [ ] Keep other settings (duration, stage theme, etc.)

---

## Phase 5: UI/UX Polish

### 5.1 Visual Assets
- [ ] Market tile sprite (or recolor existing tile)
- [ ] Cargo sprite (small crate/bundle on ground)
- [ ] Carrying cargo visual (crate on seller's back)
- [ ] Role badge indicators (🌱 / 🛒 or icons)

### 5.2 Animations & Feedback
- [ ] Cargo pickup animation (cargo → player carry state)
- [ ] Selling animation (cargo → coins burst)
- [ ] Role swap transition effect
- [ ] Cargo wilt animation (fade out after 10s)

### 5.3 Sounds (if audio exists)
- [ ] Cargo pickup sound
- [ ] Successful sell chime
- [ ] Role swap whoosh

---

## Testing Checklist

### Unit Tests (if applicable)
- [ ] Distance calculation formula: `basePrice × (1 + 0.1 × distance)`
- [ ] Cargo wilt timing: 10 seconds auto-removal
- [ ] Role validation: seller can't plant, farmer can't pick up

### Integration Tests
- [ ] **Test 1: Room Creation**
  - Create 2v2 room, 4 players join
  - Verify teams assigned (players 1-2 = Team A, 3-4 = Team B)
  - Verify roles assigned (1 seller, 1 farmer per team)
  
- [ ] **Test 2: Farm to Cargo**
  - Farmer plants crop (5s grow)
  - Farmer harvests ripe crop
  - Verify cargo appears on tile
  - Verify cargo reward calculated correctly
  
- [ ] **Test 3: Seller Pickup**
  - Seller approaches cargo
  - Seller presses pickup
  - Verify cargo moves to carrying state
  - Verify cargo removed from field
  
- [ ] **Test 4: Selling at Market**
  - Seller walks to market tile
  - Seller presses sell
  - Verify distance calculated
  - Verify coins = base × (1 + 0.1 × distance)
  - Verify team coins increase
  - Verify cargo cleared
  
- [ ] **Test 5: Role Swap**
  - During phase transition, farmer presses "Request Swap"
  - Select teammate
  - Verify roles swap
  - Verify controls switch (farmer → seller, vice versa)
  
- [ ] **Test 6: Win Condition**
  - Team reaches targetCoins (800)
  - Verify match ends
  - Verify winning team determined correctly
  
- [ ] **Test 7: Edge Cases**
  - Seller tries to harvest (blocked)
  - Farmer tries to pickup (blocked)
  - Cargo wilts after 10s (auto-remove, 0 reward)
  - Multiple swaps in one phase (limited to 1)
  - Disconnection during cargo carry (cargo rolled back, coins kept)

---

## File Dependencies (Modification Order)
1. `src/lib/game-types.ts` ← Type definitions
2. `src/lib/match-protocol.ts` ← Protocol extensions
3. `worker/match/src/match-do.ts` ← Server logic (depends on 1, 2)
4. `src/lib/match-client.ts` ← Client event handlers (depends on 1, 2)
5. `src/components/MultiplayerGame.tsx` ← UI (depends on all above)

---

## Estimated Complexity
- **Phase 1 (Types)**: 30 min
- **Phase 2 (Server)**: 2-3 hours (cargo lifecycle, validation, team tracking)
- **Phase 3 (Client)**: 1.5-2 hours (UI, controls, events)
- **Phase 4 (Settings)**: 30 min
- **Phase 5 (Polish)**: 1 hour
- **Testing**: 1-2 hours

**Total**: ~6-9 hours

---

## Known Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Cargo sync issues (cargo on client ≠ server) | Validate all cargo actions server-side, send snapshots |
| Seller role too powerful (easily earns coins) | Distance bonus is additive, not multiplied; monitor playtests |
| Role swap meta abuse | Limit to 1 swap per phase, only between phases |
| Field conflict (both teams plant same tile) | First plant wins, others blocked (simple rule) |
| Cargo wilt confusion | Show countdown timer, clear VFX on expiry |
