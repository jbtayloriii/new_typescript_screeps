# TODO

Known gaps and follow-ups that aren't on the [roadmap](ROADMAP.md) yet. Most came out of losing
W23S31 (shard0) on Nov 23 2026: Cyborger's dismantlers killed its only tower, then the spawn,
two days after the base had spent its safe mode on three harassers.

## Defense

- [ ] **Alert when the base is about to fall and safe mode isn't available.** `assessBaseThreat`
      ([defense/safe_mode.ts](../src/defense/safe_mode.ts)) already finds the reason, but
      `decideSafeMode` drops it when safe mode is on cooldown, used up or blocked. That was
      W23S31's situation. Log it (rate-limited, e.g. once per attack) with `Logger.warning` so it
      shows up in the daily email, and maybe `Game.notify` it straight away.
- [ ] **Boosted attackers.** Damage estimates assume unboosted parts, so safe mode fires late
      against boosted creeps. Needs body boosts in `HostileCreepSnapshot`.
- [ ] **Tower kill time is rough.** It assumes every hostile attacks the same structure, and that
      all hostile healing (wherever the healers are) goes to the attackers. A tick-by-tick
      estimate (towers focus one creep at a time; creeps die and stop doing damage) would be
      closer.
- [ ] **Respond to repeated player attacks.** W23S31 had 5 waves in 12 hours, each bigger than the
      last. The previous one left the tower at 500 / 3000, and nothing changed. Track attacks per
      room in intel, and respond: defenders, higher rampart targets, an alert.
- [ ] **Defend against players automatically.** Auto defense only covers NPC invaders in remotes
      ([directives/planning.ts](../src/directives/planning.ts)); players need `cmd.defend`.
- [ ] **Spawning during a siege.** While the tower was dying, the spawn kept making remote miners.
      Pause economy spawns (or switch to defenders) while the base is under attack.
- [ ] **Higher hit targets for protective ramparts.** They use the shared wall table: 100k at
      RCL 4 and 300k at RCL 5. W23S31's final wave did about 225k damage before one tower could
      have killed it all, so an RCL 4 base wouldn't hold. Consider a separate, higher table for
      ramparts over spawns, towers and storage.
- [ ] **Protect more structures.** Add the terminal, factory, labs, etc. to `PROTECTED_STRUCTURES`
      ([pathfinding/base_layout_utils.ts](../src/pathfinding/base_layout_utils.ts)) once they
      start being built, and plan a rampart perimeter (min-cut).

## Bugs

- [ ] **`myUsername` is lost with the spawn.** It comes from the first spawn's owner
      ([snapshot/world.ts](../src/snapshot/world.ts)), so a base whose spawn dies thinks its own
      remote reservations belong to another player and ends them. This happened at W23S31.
      Use the owner of an owned controller (or a creep) instead.
- [ ] **A source can be walled in by stamps.** In E22S15, with the spawn at 30,30, the planner
      reports "no road to the source": the stamps fill every tile around it. The slot search
      could skip slots touching a source's open tiles. That would change the slots of existing
      bases, though, so it needs a layout version bump.

## Performance

- [ ] **Cache the layout overlay** with `RoomVisual.export()`/`import()` if it's left on a lot.
      It's about 230 draw calls a tick (0.16 ms to build) while on, and switches off after
      200 ticks.

## Tooling

- [ ] **Room history downloads can drop chunks silently.** The download script
      (`data/recordings/W23S31_shard0_2026-11-23/scripts/dl.mjs`) only counts 404s as missing,
      so chunks that kept failing for other reasons vanished: that recording has 169 of 187
      chunks. Count and retry them, and print what's missing.
