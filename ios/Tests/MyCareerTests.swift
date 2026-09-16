import XCTest
@testable import MyCareer

/// Renders every fixture through Markdown.swift and asserts it matches the golden file
/// byte for byte. The same fixtures and goldens are checked by Tests/harness/run.js, so
/// the two implementations are pinned to each other and drift shows up as a failure
/// rather than as a difference nobody notices.
final class MarkdownGoldenTests: XCTestCase {

    /// Matches the fixed date in harness/run.js so output is deterministic.
    private let date = "2026-01-01"

    private func url(_ name: String, _ ext: String, _ dir: String) throws -> URL {
        let bundle = Bundle(for: type(of: self))
        guard let u = bundle.url(forResource: name, withExtension: ext, subdirectory: dir)
                  ?? bundle.url(forResource: name, withExtension: ext) else {
            throw XCTSkip("fixture \(name).\(ext) is not in the test bundle: check the Copy Bundle Resources phase")
        }
        return u
    }

    private func check(_ name: String) throws {
        let corpus = try JSONDecoder().decode(
            Corpus.self, from: try Data(contentsOf: try url(name, "json", "Fixtures")))
        let expected = try String(contentsOf: try url(name, "md", "Golden"), encoding: .utf8)
        let actual = Markdown.render(corpus, date: date)

        if actual != expected {
            let a = actual.components(separatedBy: "\n")
            let b = expected.components(separatedBy: "\n")
            for i in 0..<max(a.count, b.count) where a.indices.contains(i) != b.indices.contains(i) || (a.indices.contains(i) && b.indices.contains(i) && a[i] != b[i]) {
                XCTFail("""
                \(name): first difference at line \(i + 1)
                  expected: \(b.indices.contains(i) ? b[i] : "<no line>")
                  actual:   \(a.indices.contains(i) ? a[i] : "<no line>")
                """)
                return
            }
            XCTFail("\(name): output differs from the golden file")
        }
    }

    func testEmpty() throws { try check("empty") }
    func testMinimal() throws { try check("minimal") }
    func testFull() throws { try check("full") }
    func testEdgeCases() throws { try check("edge") }

    /// House style, enforced the same way the desktop pipeline enforces it.
    func testNoEmDashesAnywhere() throws {
        for name in ["empty", "minimal", "full", "edge"] {
            let corpus = try JSONDecoder().decode(
                Corpus.self, from: try Data(contentsOf: try url(name, "json", "Fixtures")))
            XCTAssertFalse(Markdown.render(corpus, date: date).contains("\u{2014}"),
                           "\(name) rendered an em dash")
        }
    }

    /// Entries with nothing in them must not reach the document.
    func testEmptyEntriesAreSkipped() {
        var role = Role(title: "Analyst", org: "Acme")
        role.entries = [Entry(), Entry(text: "Real work.")]
        var corpus = Corpus()
        corpus.roles = [role]

        let out = Markdown.render(corpus, date: date)
        XCTAssertTrue(out.contains("Real work."))
        XCTAssertFalse(out.contains("### Untitled"))
    }

    /// A figure the person cannot source is flagged rather than quietly printed.
    func testUnsourceableFiguresAreFlagged() {
        var entry = Entry(text: "Cut the backlog.")
        entry.figures = [Figure(value: "40%", what: "throughput", sourceable: false)]
        var role = Role(title: "Analyst", org: "Acme")
        role.entries = [entry]
        var corpus = Corpus()
        corpus.roles = [role]

        let out = Markdown.render(corpus, date: date)
        XCTAssertTrue(out.contains("| **no** |"), "the table must mark it unsourced")
        XCTAssertTrue(out.contains("## Numbers that still need a source"))
    }

    /// Roles sharing a start date must order deterministically, not by sort luck.
    func testStableOrderingOnEqualDates() {
        var a = Role(title: "A", org: "")
        var b = Role(title: "B", org: "")
        a.id = UUID(uuidString: "00000000-0000-0000-0000-00000000000a")!
        b.id = UUID(uuidString: "00000000-0000-0000-0000-00000000000b")!
        a.start = "2020"; b.start = "2020"

        var forward = Corpus(); forward.roles = [a, b]
        var reversed = Corpus(); reversed.roles = [b, a]
        XCTAssertEqual(Markdown.render(forward, date: date), Markdown.render(reversed, date: date))
    }
}

/// Round trips the document through disk the way the app does.
final class StoreTests: XCTestCase {

    func testCorpusSurvivesEncodingRoundTrip() throws {
        var corpus = Corpus()
        corpus.person = Person(name: "Sam Ortiz", tagline: "Engineer", location: "Reno, NV")
        var role = Role(title: "Systems Engineer", org: "Northbay")
        role.chapter = "A paragraph with \"quotes\", a pipe | and a unicode bullet ·."
        role.entries = [Entry(text: "Did the thing.", narrative: "At length.", agency: .enabled)]
        corpus.roles = [role]

        let data = try JSONEncoder().encode(corpus)
        let back = try JSONDecoder().decode(Corpus.self, from: data)
        XCTAssertEqual(corpus, back)
    }

    /// A corrupt or absent file must start the app empty rather than crash it.
    func testUnreadableDocumentStartsEmpty() throws {
        let junk = Data("not json".utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(Corpus.self, from: junk))
    }
}

// Convenience initialisers used only by the tests.
private extension Role {
    init(title: String, org: String) {
        self.init()
        self.title = title
        self.org = org
    }
}

private extension Entry {
    init(text: String, narrative: String = "", agency: Agency = .completed) {
        self.init()
        self.text = text
        self.narrative = narrative
        self.agency = agency
    }
}

private extension Figure {
    init(value: String, what: String, sourceable: Bool) {
        self.init()
        self.value = value
        self.what = what
        self.sourceable = sourceable
    }
}
