import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Config partagée app ↔ widget (App Group)

/// L'app écrit ici via ExtensionStorage (src/lib/widget.ts) : la config de
/// l'edge function (dogId/URL/secret), l'état de session (sessionStartedAt)
/// et les minutes de solitude du jour. Le widget et ses App Intents lisent.
enum Shared {
  static let suite = "group.com.gregdeshusses.ubuntu"

  static var defaults: UserDefaults? { UserDefaults(suiteName: suite) }

  static var dogId: String? { defaults?.string(forKey: "widget.dogId") }
  static var functionUrl: String? { defaults?.string(forKey: "widget.functionUrl") }
  static var secret: String? { defaults?.string(forKey: "widget.secret") }

  static var isConfigured: Bool {
    dogId?.isEmpty == false && functionUrl?.isEmpty == false && secret?.isEmpty == false
  }

  /// Début de session poussé par l'app (0 = aucune) : secours hors ligne
  /// et affichage instantané quand on agit depuis l'app.
  static var appSessionStart: Date? {
    let epoch = defaults?.double(forKey: "sessionStartedAt") ?? 0
    return epoch > 0 ? Date(timeIntervalSince1970: epoch) : nil
  }

  static var soloMinutes: Int { Int(defaults?.double(forKey: "soloMinutes") ?? 0) }
  static var soloGoal: Int { max(1, Int(defaults?.double(forKey: "soloGoal") ?? 15)) }

  // Snapshot du dernier statut réseau. Stocké en String : simple et
  // symétrique avec ce que sait écrire ExtensionStorage côté JS.
  static func writeSnapshot(_ status: StatusResponse) {
    guard let data = try? JSONEncoder().encode(status),
      let text = String(data: data, encoding: .utf8)
    else { return }
    defaults?.set(text, forKey: "widget.snapshot")
  }

  static func readSnapshot() -> StatusResponse? {
    guard let text = defaults?.string(forKey: "widget.snapshot"),
      let data = text.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(StatusResponse.self, from: data)
  }

  // Petit canal d'erreur : un intent qui échoue n'a aucun retour visuel,
  // alors on affiche l'échec dans le widget pendant quelques minutes.
  static func writeError(_ message: String) {
    defaults?.set(message, forKey: "widget.lastError")
    defaults?.set(Date().timeIntervalSince1970, forKey: "widget.lastErrorAt")
  }

  static func recentError() -> String? {
    guard let message = defaults?.string(forKey: "widget.lastError") else { return nil }
    let at = defaults?.double(forKey: "widget.lastErrorAt") ?? 0
    guard Date().timeIntervalSince1970 - at < 180 else { return nil }
    return message
  }

  static func clearError() {
    defaults?.removeObject(forKey: "widget.lastError")
    defaults?.removeObject(forKey: "widget.lastErrorAt")
  }
}

// MARK: - Client de l'Edge Function widget-actions

struct SessionInfo: Codable {
  let id: String
  let started_at_epoch: Double
  let calm_percent: Double?
}

struct WalkInfo: Codable {
  let at_epoch: Double
  let ended_at_epoch: Double?
}

struct StatusResponse: Codable {
  let session: SessionInfo?
  let last_walk: WalkInfo?
}

enum WidgetAPIError: Error {
  case unconfigured
  case http(Int, String)
}

enum WidgetAPI {
  static func post(action: String) async throws -> Data {
    guard Shared.isConfigured,
      let urlString = Shared.functionUrl,
      let url = URL(string: urlString),
      let dogId = Shared.dogId,
      let secret = Shared.secret
    else { throw WidgetAPIError.unconfigured }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 15
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "secret": secret,
      "dog_id": dogId,
      "action": action,
    ])

    let (data, response) = try await URLSession.shared.data(for: request)
    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(code) else {
      let body = String(data: data, encoding: .utf8) ?? ""
      throw WidgetAPIError.http(code, body)
    }
    return data
  }

  static func status() async throws -> StatusResponse {
    let data = try await post(action: "status")
    return try JSONDecoder().decode(StatusResponse.self, from: data)
  }
}

// MARK: - App Intents (les deux boutons)

struct RecordWalkIntent: AppIntent {
  static var title: LocalizedStringResource = "Enregistrer une balade"
  static var description = IntentDescription(
    "Ajoute une balade de 15 minutes (démarrée il y a 5 minutes).")

  func perform() async throws -> some IntentResult {
    do {
      _ = try await WidgetAPI.post(action: "walk")
      Shared.clearError()
    } catch {
      Shared.writeError("BALADE NON ENREGISTRÉE")
    }
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}

struct StartSoloIntent: AppIntent {
  static var title: LocalizedStringResource = "Démarrer une session solo"
  static var description = IntentDescription(
    "Démarre une session de solitude pour Ubuntu maintenant.")

  func perform() async throws -> some IntentResult {
    do {
      let data = try await WidgetAPI.post(action: "solo")
      // Affichage immédiat, sans attendre le refetch de la timeline.
      if let status = try? JSONDecoder().decode(StatusResponse.self, from: data) {
        Shared.writeSnapshot(StatusResponse(session: status.session, last_walk: nil))
        if let start = status.session?.started_at_epoch {
          Shared.defaults?.set(start, forKey: "sessionStartedAt")
        }
      }
      Shared.clearError()
    } catch WidgetAPIError.http(409, _) {
      // Une session est déjà en cours : le refresh l'affichera.
      Shared.clearError()
    } catch {
      Shared.writeError("SESSION NON DÉMARRÉE")
    }
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}

// MARK: - Timeline

struct UbuntuEntry: TimelineEntry {
  let date: Date
  let configured: Bool
  let session: SessionInfo?
  let lastWalk: WalkInfo?
  let soloMinutes: Int
  let soloGoal: Int
  let error: String?

  var sessionStart: Date? {
    session.map { Date(timeIntervalSince1970: $0.started_at_epoch) }
  }
}

struct UbuntuProvider: TimelineProvider {
  /// Entrée construite hors réseau : état poussé par l'app + dernier
  /// snapshot réseau (pour le % de sagesse).
  private func offlineEntry(error: String? = nil) -> UbuntuEntry {
    let snapshot = Shared.readSnapshot()
    var session: SessionInfo? = nil
    if let start = Shared.appSessionStart {
      session = SessionInfo(
        id: snapshot?.session?.id ?? "local",
        started_at_epoch: start.timeIntervalSince1970,
        calm_percent: snapshot?.session?.calm_percent)
    }
    return UbuntuEntry(
      date: Date(), configured: Shared.isConfigured, session: session,
      lastWalk: snapshot?.last_walk, soloMinutes: Shared.soloMinutes,
      soloGoal: Shared.soloGoal, error: error)
  }

  func placeholder(in context: Context) -> UbuntuEntry {
    UbuntuEntry(
      date: Date(), configured: true, session: nil, lastWalk: nil,
      soloMinutes: 5, soloGoal: 15, error: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (UbuntuEntry) -> Void) {
    completion(offlineEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<UbuntuEntry>) -> Void) {
    Task {
      var entry: UbuntuEntry
      if Shared.isConfigured, let fresh = try? await WidgetAPI.status() {
        Shared.writeSnapshot(fresh)
        // L'app group reste cohérent même si l'app n'a pas tourné.
        Shared.defaults?.set(
          fresh.session?.started_at_epoch ?? 0, forKey: "sessionStartedAt")
        entry = UbuntuEntry(
          date: Date(), configured: true, session: fresh.session,
          lastWalk: fresh.last_walk, soloMinutes: Shared.soloMinutes,
          soloGoal: Shared.soloGoal, error: Shared.recentError())
      } else {
        entry = offlineEntry(error: Shared.recentError())
      }
      // Session en cours : refresh toutes les 5 min pour le % de sagesse
      // (la durée est un timer live, elle). Sinon toutes les 30 min.
      let next = Date().addingTimeInterval(entry.session != nil ? 5 * 60 : 30 * 60)
      completion(Timeline(entries: [entry], policy: .after(next)))
    }
  }
}

// MARK: - Palette pixel (reprend constants/theme.ts)

struct Palette {
  let background: Color
  let card: Color
  let border: Color
  let text: Color
  let textSecondary: Color
  let success: Color
  let danger: Color
  let accent: Color
  let accentText: Color

  static let light = Palette(
    background: Color(red: 0.910, green: 0.875, blue: 0.784),  // #E8DFC8
    card: Color(red: 0.973, green: 0.957, blue: 0.878),  // #F8F4E0
    border: Color(red: 0.200, green: 0.196, blue: 0.243),  // #33323E
    text: Color(red: 0.165, green: 0.165, blue: 0.200),  // #2A2A33
    textSecondary: Color(red: 0.420, green: 0.396, blue: 0.333),  // #6B6555
    success: Color(red: 0.235, green: 0.549, blue: 0.314),  // #3C8C50
    danger: Color(red: 0.690, green: 0.188, blue: 0.157),  // #B03028
    accent: Color(red: 0.784, green: 0.298, blue: 0.204),  // #C84C34
    accentText: Color(red: 0.973, green: 0.957, blue: 0.878))  // #F8F4E0

  static let dark = Palette(
    background: Color(red: 0.090, green: 0.098, blue: 0.157),  // #171928
    card: Color(red: 0.137, green: 0.157, blue: 0.259),  // #232842
    border: Color(red: 0.431, green: 0.455, blue: 0.580),  // #6E7494
    text: Color(red: 0.937, green: 0.918, blue: 0.859),  // #EFEADB
    textSecondary: Color(red: 0.612, green: 0.600, blue: 0.659),  // #9C99A8
    success: Color(red: 0.345, green: 0.690, blue: 0.439),  // #58B070
    danger: Color(red: 0.878, green: 0.345, blue: 0.282),  // #E05848
    accent: Color(red: 0.878, green: 0.376, blue: 0.282),  // #E06048
    accentText: Color(red: 0.090, green: 0.098, blue: 0.157))  // #171928
}

// MARK: - Briques UI

/// Bouton pixel : bordure épaisse, coins presque carrés, comme dans l'app.
struct PixelButton<I: AppIntent, Content: View>: View {
  let intent: I
  let filled: Bool
  @ViewBuilder let content: Content
  @Environment(\.colorScheme) private var scheme
  private var palette: Palette { scheme == .dark ? .dark : .light }

  var body: some View {
    Button(intent: intent) {
      content
        .frame(maxWidth: .infinity, minHeight: 34)
    }
    .buttonStyle(.plain)
    .background(filled ? palette.accent : palette.card)
    .foregroundStyle(filled ? palette.accentText : palette.text)
    .overlay(RoundedRectangle(cornerRadius: 2).stroke(palette.border, lineWidth: 2))
    .clipShape(RoundedRectangle(cornerRadius: 2))
  }
}

struct CalmPercentText: View {
  let percent: Double?
  var font: Font = .system(size: 22, weight: .bold, design: .monospaced)
  @Environment(\.colorScheme) private var scheme
  private var palette: Palette { scheme == .dark ? .dark : .light }

  var body: some View {
    if let percent {
      Text("\(Int(percent.rounded()))%")
        .font(font)
        .foregroundStyle(percent >= 90 ? palette.success : palette.danger)
    } else {
      Text("—")
        .font(font)
        .foregroundStyle(palette.textSecondary)
    }
  }
}

/// Durée qui tourne toute seule (timer système, zéro refresh de timeline).
struct SessionTimerText: View {
  let start: Date
  var font: Font = .system(size: 15, weight: .semibold, design: .monospaced)

  var body: some View {
    Text(start, style: .timer)
      .font(font)
      .monospacedDigit()
      .multilineTextAlignment(.leading)
  }
}

// MARK: - Widget d'accueil (systemSmall / systemMedium)

struct HomeWidgetView: View {
  let entry: UbuntuEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  private var palette: Palette { scheme == .dark ? .dark : .light }

  private var walkLabel: String? {
    guard let walk = entry.lastWalk else { return nil }
    let start = Date(timeIntervalSince1970: walk.at_epoch)
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "fr_FR")
    formatter.timeZone = TimeZone(identifier: "Europe/Paris")
    formatter.dateFormat = Calendar.current.isDateInToday(start) ? "HH:mm" : "EEE HH:mm"
    return "🚶 balade \(formatter.string(from: start)) · 🐾 solo \(entry.soloMinutes)/\(entry.soloGoal) min"
  }

  var body: some View {
    VStack(spacing: 6) {
      if !entry.configured {
        Text("OUVRE L'APP UBUNTU")
          .font(.system(size: 11, weight: .bold, design: .monospaced))
          .foregroundStyle(palette.textSecondary)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let start = entry.sessionStart {
        activeSession(start: start)
      } else {
        idleButtons
      }
      if let error = entry.error {
        Text("⚠️ \(error)")
          .font(.system(size: 8, weight: .bold, design: .monospaced))
          .foregroundStyle(palette.danger)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
    }
    .containerBackground(palette.background, for: .widget)
  }

  // Session en cours : durée live + % de sagesse, SOLO devient un état.
  @ViewBuilder
  private func activeSession(start: Date) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 6) {
        Circle().fill(palette.danger).frame(width: 8, height: 8)
        Text("UBUNTU SEUL")
          .font(.system(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(palette.text)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      HStack(alignment: .lastTextBaseline) {
        SessionTimerText(start: start)
          .foregroundStyle(palette.text)
        Spacer(minLength: 4)
        CalmPercentText(percent: entry.session?.calm_percent)
      }
      Text("SAGESSE")
        .font(.system(size: 7, weight: .bold, design: .monospaced))
        .foregroundStyle(palette.textSecondary)
        .frame(maxWidth: .infinity, alignment: .trailing)
      if family != .systemSmall {
        PixelButton(intent: RecordWalkIntent(), filled: false) {
          Text("🚶 BALADE 15 MIN")
            .font(.system(size: 10, weight: .bold, design: .monospaced))
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  // Pas de session : les deux boutons, plus la ligne d'infos en médium.
  @ViewBuilder
  private var idleButtons: some View {
    VStack(spacing: 6) {
      if family == .systemSmall {
        PixelButton(intent: RecordWalkIntent(), filled: false) {
          Text("🚶 BALADE")
            .font(.system(size: 10, weight: .bold, design: .monospaced))
        }
        PixelButton(intent: StartSoloIntent(), filled: true) {
          Text("🔴 SOLO")
            .font(.system(size: 10, weight: .bold, design: .monospaced))
        }
      } else {
        HStack(spacing: 8) {
          PixelButton(intent: RecordWalkIntent(), filled: false) {
            Text("🚶 BALADE 15 MIN")
              .font(.system(size: 10, weight: .bold, design: .monospaced))
          }
          PixelButton(intent: StartSoloIntent(), filled: true) {
            Text("🔴 SOLO")
              .font(.system(size: 10, weight: .bold, design: .monospaced))
          }
        }
        if let walkLabel {
          Text(walkLabel)
            .font(.system(size: 9, design: .monospaced))
            .foregroundStyle(palette.textSecondary)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// MARK: - Écran de verrouillage

/// Rectangle : « 1h23 · 97% » en session, sinon les deux boutons.
struct AccessoryRectangularView: View {
  let entry: UbuntuEntry

  var body: some View {
    if let start = entry.sessionStart {
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 4) {
          Circle().fill(.red).frame(width: 7, height: 7)
          Text("UBUNTU SEUL").font(.caption2).bold()
        }
        HStack(alignment: .lastTextBaseline, spacing: 6) {
          SessionTimerText(
            start: start, font: .system(size: 18, weight: .bold, design: .monospaced))
          if let calm = entry.session?.calm_percent {
            Text("\(Int(calm.rounded()))%")
              .font(.system(size: 15, weight: .semibold, design: .monospaced))
          }
        }
        Text("sagesse")
          .font(.caption2)
          .opacity(0.7)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .containerBackground(.clear, for: .widget)
      .widgetURL(URL(string: "ubuntu:///"))
    } else {
      HStack(spacing: 6) {
        Button(intent: RecordWalkIntent()) {
          VStack(spacing: 0) {
            Text("🚶")
            Text("BALADE").font(.system(size: 8, weight: .bold, design: .monospaced))
          }
          .frame(maxWidth: .infinity)
        }
        Button(intent: StartSoloIntent()) {
          VStack(spacing: 0) {
            Text("🔴")
            Text("SOLO").font(.system(size: 8, weight: .bold, design: .monospaced))
          }
          .frame(maxWidth: .infinity)
        }
      }
      .containerBackground(.clear, for: .widget)
    }
  }
}

/// Cercle : % de sagesse en session, sinon jauge minutes solo du jour.
struct AccessoryCircularView: View {
  let entry: UbuntuEntry

  var body: some View {
    if let start = entry.sessionStart {
      Gauge(value: min(100, max(0, entry.session?.calm_percent ?? 100)), in: 0...100) {
        Text("SAGE")
      } currentValueLabel: {
        VStack(spacing: -2) {
          Text("\(Int((entry.session?.calm_percent ?? 100).rounded()))")
            .font(.system(size: 16, weight: .bold, design: .monospaced))
          SessionTimerText(start: start, font: .system(size: 8, weight: .semibold))
            .multilineTextAlignment(.center)
        }
      }
      .gaugeStyle(.accessoryCircular)
      .containerBackground(.clear, for: .widget)
      .widgetURL(URL(string: "ubuntu:///"))
    } else {
      Gauge(value: min(1.0, Double(entry.soloMinutes) / Double(entry.soloGoal))) {
        Image(systemName: "pawprint.fill")
      } currentValueLabel: {
        Text("\(entry.soloMinutes)")
          .font(.system(size: 16, weight: .semibold))
      }
      .gaugeStyle(.accessoryCircular)
      .containerBackground(.clear, for: .widget)
      .widgetURL(URL(string: "ubuntu:///solo"))
    }
  }
}

/// Ligne au-dessus de l'heure : état compact.
struct AccessoryInlineView: View {
  let entry: UbuntuEntry

  var body: some View {
    Group {
      if let start = entry.sessionStart {
        if let calm = entry.session?.calm_percent {
          Text("🔴 \(Text(start, style: .timer)) · \(Int(calm.rounded()))% sage")
        } else {
          Text("🔴 Seul depuis \(Text(start, style: .timer))")
        }
      } else {
        Text("🐾 Solo \(entry.soloMinutes)/\(entry.soloGoal) min")
      }
    }
    .containerBackground(.clear, for: .widget)
    .widgetURL(URL(string: entry.sessionStart != nil ? "ubuntu:///" : "ubuntu:///solo"))
  }
}

struct LockWidgetView: View {
  let entry: UbuntuEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    switch family {
    case .accessoryCircular: AccessoryCircularView(entry: entry)
    case .accessoryInline: AccessoryInlineView(entry: entry)
    default: AccessoryRectangularView(entry: entry)
    }
  }
}

// MARK: - Déclaration des widgets

struct UbuntuHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "UbuntuHomeWidget", provider: UbuntuProvider()) { entry in
      HomeWidgetView(entry: entry)
    }
    .configurationDisplayName("UBUNTU")
    .description("Balade express et session solo, sans ouvrir l'app.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct UbuntuLockWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "UbuntuLockWidget", provider: UbuntuProvider()) { entry in
      LockWidgetView(entry: entry)
    }
    .configurationDisplayName("UBUNTU")
    .description("Durée et sagesse de la session en cours.")
    .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}

@main
struct UbuntuWidgetBundle: WidgetBundle {
  var body: some Widget {
    UbuntuHomeWidget()
    UbuntuLockWidget()
  }
}
