import Foundation

// The whole data model. One file, one JSON document on disk.
// Field names deliberately match the myCareer corpus vocabulary (chapter, narrative,
// constraint, agency, confirmedDetail, sourceable) so a converter to the full schema
// is a mapping exercise rather than a redesign.

struct Corpus: Codable, Equatable {
    var version = "1"
    var person = Person()
    var roles: [Role] = []
}

struct Person: Codable, Equatable {
    var name = ""
    var tagline = ""
    var location = ""
}

struct Role: Codable, Equatable, Identifiable {
    var id = UUID()
    var title = ""
    var org = ""
    var location = ""
    var start = ""          // "2018" or "2018-11"
    var end = ""            // empty means present
    var chapter = ""        // the autobiography narrative for this role
    var entries: [Entry] = []

    var span: String {
        let from = start.isEmpty ? "?" : start
        return end.isEmpty ? "\(from) to present" : "\(from) to \(end)"
    }

    var heading: String {
        [title, org].filter { !$0.isEmpty }.joined(separator: ", ")
    }
}

struct Entry: Codable, Equatable, Identifiable {
    var id = UUID()
    var text = ""               // flat, neutral, one sentence
    var narrative = ""          // written first, and longest
    var constraint = ""         // the pressure that made it necessary
    var agency: Agency = .completed
    var confirmedDetail = ""    // the particular nobody else supplied
    var whatWentWrong = ""
    var couldConfirm = ""       // who could attest, and to what
    var figures: [Figure] = []
}

enum Agency: String, Codable, Equatable, CaseIterable, Identifiable {
    case completed, scoped, enabled
    var id: String { rawValue }

    var label: String {
        switch self {
        case .completed: return "I did it"
        case .scoped:    return "I scoped it and handed it off"
        case .enabled:   return "I enabled a team to do it"
        }
    }
}

struct Figure: Codable, Equatable, Identifiable {
    var id = UUID()
    var value = ""          // "$2.4M", "18 months", "48"
    var what = ""           // what it measures
    var baseline = ""       // what it was before
    var source = ""         // where it can be produced from
    var sourceable = false  // can you actually produce that source today
}

// MARK: - Prompts
//
// These are why this is not a notes app. Recall collapses detail; recognition does not.
// Each screen shows the questions that pull specifics out, drawn from the interrogation
// protocol. They are never answered for you.

enum Prompts {
    static let chapter = [
        "What state was the place in when you arrived?",
        "What did you inherit, and what was already broken?",
        "What would have broken if you had not been there?",
        "What was true before you, and what was true after?",
        "What did this role add to what you can do?",
        "What is the honest framing for why it ended?",
    ]

    static let entry = [
        "What did you personally do, as distinct from your team or a vendor?",
        "Who else was in the room?",
        "What decision did you make that a competent peer might have made differently?",
        "How would anyone outside your team know it worked?",
        "What did people say when it shipped?",
        "What was the constraint that made this necessary?",
    ]

    static let hard = [
        "What went wrong, or was left undone?",
        "Who could contradict this account, and what would they say?",
        "Who could confirm it, and what narrow part could they speak to?",
    ]

    static let figure = [
        "What was the number before?",
        "How was it measured, and by what system?",
        "Where could you produce that source from today?",
    ]
}
