import SwiftUI
import WidgetKit

/// App group partagé avec l'app (écrit via ExtensionStorage côté JS).
enum WidgetConfigValues {
  static let appGroup = "group.com.gregdeshusses.ubuntu"
}

struct UbuntuEntry: TimelineEntry {
  let date: Date
  /// Début de la session SOLO en cours (nil si aucune).
  let sessionStart: Date?
  /// Minutes de solitude cumulées aujourd'hui et objectif du jour.
  let soloMinutes: Int
  let soloGoal: Int
}

struct Provider: TimelineProvider {
  func loadEntry() -> UbuntuEntry {
    let defaults = UserDefaults(suiteName: WidgetConfigValues.appGroup)
    let start = defaults?.double(forKey: "sessionStartedAt") ?? 0
    return UbuntuEntry(
      date: Date(),
      sessionStart: start > 0 ? Date(timeIntervalSince1970: start) : nil,
      soloMinutes: Int(defaults?.double(forKey: "soloMinutes") ?? 0),
      soloGoal: max(1, Int(defaults?.double(forKey: "soloGoal") ?? 15))
    )
  }

  func placeholder(in context: Context) -> UbuntuEntry {
    UbuntuEntry(date: Date(), sessionStart: nil, soloMinutes: 5, soloGoal: 15)
  }

  func getSnapshot(in context: Context, completion: @escaping (UbuntuEntry) -> Void) {
    completion(loadEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<UbuntuEntry>) -> Void) {
    // Le chrono (style .timer) vit tout seul ; l'app recharge le widget à
    // chaque changement d'état — on se re-rafraîchit quand même par sécurité.
    let timeline = Timeline(
      entries: [loadEntry()],
      policy: .after(Date().addingTimeInterval(30 * 60))
    )
    completion(timeline)
  }
}

struct UbuntuWidgetView: View {
  @Environment(\.widgetFamily) var family
  var entry: UbuntuEntry

  var body: some View {
    content
      // Session en cours → ouvre l'app ; sinon → lance une session SOLO.
      .widgetURL(URL(string: entry.sessionStart != nil ? "ubuntu:///" : "ubuntu:///solo"))
  }

  @ViewBuilder
  private var content: some View {
    switch family {
    case .accessoryCircular: circular
    case .accessoryInline: inline
    default: rectangular
    }
  }

  // ------------------------------------------------ Cercle (lock screen)

  @ViewBuilder
  private var circular: some View {
    if let start = entry.sessionStart {
      VStack(spacing: 0) {
        Text("SEUL")
          .font(.system(size: 9, weight: .bold))
        Text(start, style: .timer)
          .font(.system(size: 13, weight: .semibold))
          .monospacedDigit()
          .multilineTextAlignment(.center)
      }
    } else {
      Gauge(value: min(1.0, Double(entry.soloMinutes) / Double(entry.soloGoal))) {
        Image(systemName: "pawprint.fill")
      } currentValueLabel: {
        Text("\(entry.soloMinutes)")
          .font(.system(size: 16, weight: .semibold))
      }
      .gaugeStyle(.accessoryCircular)
    }
  }

  // -------------------------------------------- Rectangle (lock screen)

  @ViewBuilder
  private var rectangular: some View {
    if let start = entry.sessionStart {
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 4) {
          Circle().fill(.red).frame(width: 7, height: 7)
          Text("UBUNTU SEUL").font(.caption2).bold()
        }
        Text(start, style: .timer)
          .font(.title3)
          .monospacedDigit()
        Text("Toucher pour ouvrir")
          .font(.caption2)
          .opacity(0.7)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 4) {
          Image(systemName: "pawprint.fill").font(.caption2)
          Text("SOLO AUJOURD'HUI").font(.caption2).bold()
        }
        Text("\(entry.soloMinutes)/\(entry.soloGoal) min")
          .font(.title3)
          .monospacedDigit()
        Text("Toucher : lancer une session")
          .font(.caption2)
          .opacity(0.7)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // ------------------------------------------------- Ligne (au-dessus de l'heure)

  @ViewBuilder
  private var inline: some View {
    if entry.sessionStart != nil {
      Text("🔴 Ubuntu est seul")
    } else {
      Text("🐾 Solo \(entry.soloMinutes)/\(entry.soloGoal) min")
    }
  }
}

struct UbuntuWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "UbuntuWidget", provider: Provider()) { entry in
      UbuntuWidgetView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName("UBUNTU")
    .description("Session solo en cours (chrono) ou minutes du jour.")
    .supportedFamilies([
      .accessoryCircular,
      .accessoryRectangular,
      .accessoryInline,
      .systemSmall,
    ])
  }
}

@main
struct UbuntuWidgets: WidgetBundle {
  var body: some Widget {
    UbuntuWidget()
  }
}
