import { Game, MessageType, Player } from "../game/Game";
import {
  GameUpdate,
  GameUpdateType,
  GameUpdateViewData,
  UnitUpdate,
} from "../game/GameUpdates";
import { canSeeNavalUnit } from "../game/NavalCombat";
/** A separate visibility ledger per authenticated viewer. Never share these ledgers between players. */
export class AuthoritativeView {
  private initialized = false;
  private contacts = new Map<
    number,
    { id: number; pos: number; expiresAt: number }
  >();
  private known = new Map<number, UnitUpdate>();
  project(
    game: Game,
    viewer: Player | undefined,
    frame: GameUpdateViewData,
    bootstrap = false,
  ): GameUpdateViewData {
    const units: UnitUpdate[] = [];
    const visible = new Set<number>();
    for (const unit of game.units()) {
      if (!unit.isActive() || !canSeeNavalUnit(game, viewer, unit)) continue;
      visible.add(unit.id());
    }
    for (const unit of game.units()) {
      if (!visible.has(unit.id())) continue;
      const update = unit.toUpdate();
      if (!this.known.has(unit.id())) update.lastPos = update.pos;
      // Hidden target IDs and patrol coordinates must not reveal a submarine indirectly.
      if (
        update.targetUnitId !== undefined &&
        !visible.has(update.targetUnitId)
      )
        update.targetUnitId = undefined;
      if (unit.owner() !== viewer && update.warshipState) {
        update.warshipState = {
          ...update.warshipState,
          patrolTile: undefined,
          retreatPort: undefined,
        };
        update.targetTile = undefined;
      }
      this.contacts.delete(unit.id());
      units.push(update);
      this.known.set(unit.id(), structuredClone(update));
    }
    for (const [id, previous] of this.known) {
      if (visible.has(id)) continue;
      // Remove using the LAST delivered position, never the new hidden position.
      if (previous.warshipState?.navalVariant === "submarine")
        this.contacts.set(id, {
          id,
          pos: previous.pos,
          expiresAt: frame.tick + 30,
        });
      units.push({
        ...previous,
        concealed: true,
        isActive: false,
        health: undefined,
        targetTile: undefined,
        targetUnitId: undefined,
      });
      this.known.delete(id);
    }
    const updates = Object.fromEntries(
      Object.values(GameUpdateType)
        .filter((t) => typeof t === "number")
        .map((t) => [t, []]),
    ) as unknown as GameUpdateViewData["updates"];
    updates[GameUpdateType.Unit] = units;
    // Full player state is needed only on join/reconnect. Normal frames retain
    // the engine's deltas and packed stat channels, rather than copying every
    // bot and nation snapshot for every viewer on every tick.
    updates[GameUpdateType.Player] =
      bootstrap || !this.initialized
        ? game.players().map((p) => p.snapshotView())
        : frame.updates[GameUpdateType.Player];
    this.initialized = true;
    // Explicitly public event families only. New event types must opt in after privacy review.
    const publicTypes = [
      GameUpdateType.Win,
      GameUpdateType.SpawnPhaseEnd,
      GameUpdateType.GamePaused,
      GameUpdateType.RailroadConstructionEvent,
      GameUpdateType.RailroadDestructionEvent,
      GameUpdateType.RailroadSnapEvent,
      GameUpdateType.ConquestEvent,
      GameUpdateType.EmbargoEvent,
      GameUpdateType.AllianceRequest,
      GameUpdateType.AllianceRequestReply,
      GameUpdateType.BrokeAlliance,
      GameUpdateType.AllianceExpired,
      GameUpdateType.AllianceExtension,
      GameUpdateType.TargetPlayer,
      GameUpdateType.Emoji,
      GameUpdateType.DonateEvent,
    ];
    if (!bootstrap)
      for (const type of publicTypes)
        (updates[type] as GameUpdate[]) = frame.updates[type] ?? [];
    if (!bootstrap && viewer) {
      updates[GameUpdateType.DisplayChatEvent] = frame.updates[
        GameUpdateType.DisplayChatEvent
      ].filter((event) => event.recipient === viewer.id());
      const safeMessages = new Set([
        MessageType.ATTACK_FAILED,
        MessageType.ATTACK_CANCELLED,
        MessageType.ATTACK_REQUEST,
        MessageType.CONQUERED_PLAYER,
        MessageType.ALLIANCE_ACCEPTED,
        MessageType.ALLIANCE_REJECTED,
        MessageType.ALLIANCE_REQUEST,
        MessageType.ALLIANCE_BROKEN,
        MessageType.ALLIANCE_EXPIRED,
        MessageType.RENEW_ALLIANCE,
        MessageType.DONATION_SENT,
        MessageType.DONATION_RECEIVED,
      ]);
      updates[GameUpdateType.DisplayEvent] = frame.updates[
        GameUpdateType.DisplayEvent
      ].filter(
        (event) =>
          event.playerID === viewer.smallID() &&
          event.unitID === undefined &&
          safeMessages.has(event.messageType),
      );
    }
    // Motion plans contain FUTURE positions, so none cross this boundary (including visible submarines).
    for (const [id, contact] of this.contacts)
      if (contact.expiresAt <= frame.tick) this.contacts.delete(id);
    return {
      navalContacts: [...this.contacts.values()],
      tick: frame.tick,
      updates,
      packedTileUpdates: frame.packedTileUpdates,
      packedPlayerUpdates: frame.packedPlayerUpdates,
      packedAttackUpdates: frame.packedAttackUpdates,
      playerNameViewData: frame.playerNameViewData,
    };
  }
  reset(): void {
    this.initialized = false;
    this.known.clear();
    this.contacts.clear();
  }
}
