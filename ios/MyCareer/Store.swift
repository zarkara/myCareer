import Foundation
import Observation

/// Basic file storage: one JSON document in the app's Documents directory, written
/// atomically. No database, no sync, no network. The exported Markdown lands beside it,
/// and Documents is exposed to the Files app so both are reachable without this app.
@Observable
final class Store {

    var corpus: Corpus
    private(set) var lastError: String?

    @ObservationIgnored private var saveTask: Task<Void, Never>?

    static var documents: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }
    private static var corpusURL: URL { documents.appendingPathComponent("mycareer.json") }

    init() {
        do {
            let data = try Data(contentsOf: Self.corpusURL)
            corpus = try JSONDecoder().decode(Corpus.self, from: data)
        } catch {
            // First launch, or an unreadable file. Starting empty is correct; the old file
            // is left untouched on disk rather than overwritten, so nothing is destroyed.
            corpus = Corpus()
        }
    }

    // MARK: - Saving

    /// Debounced. Typing does not hit the disk on every keystroke.
    func autosave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            self?.save()
        }
    }

    func save() {
        saveTask?.cancel()
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(corpus)
            try data.write(to: Self.corpusURL, options: [.atomic, .completeFileProtection])
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Export

    /// Writes the Markdown export into Documents and returns its URL, ready to share
    /// or to save anywhere through the Files app.
    func writeMarkdown() -> URL? {
        let text = Markdown.render(corpus)
        let url = Self.documents.appendingPathComponent(filename())
        do {
            try Data(text.utf8).write(to: url, options: [.atomic, .completeFileProtection])
            return url
        } catch {
            lastError = error.localizedDescription
            return nil
        }
    }

    private func filename() -> String {
        let base = corpus.person.name.isEmpty ? "career" : corpus.person.name
        let safe = base.components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
            .lowercased()
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return "\(safe)-autobiography-\(f.string(from: Date())).md"
    }

    // MARK: - Mutations

    func addRole() -> UUID {
        let role = Role()
        corpus.roles.append(role)
        save()
        return role.id
    }

    func deleteRoles(at offsets: IndexSet) {
        corpus.roles.remove(atOffsets: offsets)
        save()
    }
}
