import Foundation

// Renders the corpus to Markdown. Pure function, no side effects, no dependencies.
// Avoids em dashes so the output passes the same house style the desktop pipeline enforces.

enum Markdown {

    /// - Parameter date: injected by the tests so output is deterministic; the app omits it.
    static func render(_ c: Corpus, date: String? = nil) -> String {
        var out: [String] = []

        out.append(c.person.name.isEmpty ? "# Career Autobiography"
                                         : "# Career Autobiography: \(c.person.name)")
        if !c.person.tagline.isEmpty { out.append("*\(c.person.tagline)*") }
        if !c.person.location.isEmpty { out.append(c.person.location) }
        out.append("")

        // Swift's sort is not stable, so ties need an explicit tiebreak or two roles
        // sharing a start date can come out in either order between runs.
        let ordered = c.roles.sorted {
            $0.start == $1.start ? $0.id.uuidString < $1.id.uuidString : $0.start > $1.start
        }
        for role in ordered {
            out.append("## \(role.heading.isEmpty ? "Untitled chapter" : role.heading)")
            let meta = [role.location, role.span].filter { !$0.isEmpty }.joined(separator: " · ")
            if !meta.isEmpty { out.append("*\(meta)*") }
            out.append("")

            if !role.chapter.isEmpty {
                out.append(role.chapter)
                out.append("")
            }

            for e in role.entries where !e.isEmpty {
                out.append(contentsOf: entry(e))
            }
        }

        let unsourced = c.roles.flatMap(\.entries).flatMap(\.figures).filter { !$0.sourceable && !$0.value.isEmpty }
        if !unsourced.isEmpty {
            out.append("## Numbers that still need a source")
            out.append("")
            out.append("These are not ready to put in front of anyone. A number you cannot produce a source for gets omitted, not softened.")
            out.append("")
            for f in unsourced {
                out.append("- **\(f.value)**\(f.what.isEmpty ? "" : ", \(f.what)")\(f.source.isEmpty ? "" : " (claimed source: \(f.source))")")
            }
            out.append("")
        }

        out.append("---")
        out.append("")
        out.append("Exported \(date ?? stamp()) from myCareer.")

        return out.joined(separator: "\n")
            .replacingOccurrences(of: "\n\n\n", with: "\n\n")
    }

    private static func entry(_ e: Entry) -> [String] {
        var out: [String] = []

        if !e.text.isEmpty {
            out.append("### \(e.text)")
        } else {
            out.append("### Untitled")
        }
        out.append("")
        out.append("*\(e.agency.label).*")
        out.append("")

        if !e.narrative.isEmpty { out.append(e.narrative); out.append("") }
        if !e.constraint.isEmpty { out.append("**The constraint.** \(e.constraint)"); out.append("") }
        if !e.confirmedDetail.isEmpty { out.append("**The detail that pins it down.** \(e.confirmedDetail)"); out.append("") }
        if !e.whatWentWrong.isEmpty { out.append("**What went wrong.** \(e.whatWentWrong)"); out.append("") }
        if !e.couldConfirm.isEmpty { out.append("**Who could confirm it.** \(e.couldConfirm)"); out.append("") }

        let figures = e.figures.filter { !$0.value.isEmpty }
        if !figures.isEmpty {
            out.append("| Figure | Measures | Before | Source | Sourceable |")
            out.append("|---|---|---|---|---|")
            for f in figures {
                out.append("| \(cell(f.value)) | \(cell(f.what)) | \(cell(f.baseline)) | \(cell(f.source)) | \(f.sourceable ? "yes" : "**no**") |")
            }
            out.append("")
        }

        return out
    }

    private static func cell(_ s: String) -> String {
        s.isEmpty ? " " : s.replacingOccurrences(of: "|", with: "\\|")
    }

    private static func stamp() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}

extension Entry {
    var isEmpty: Bool {
        text.isEmpty && narrative.isEmpty && constraint.isEmpty
            && confirmedDetail.isEmpty && whatWentWrong.isEmpty
            && couldConfirm.isEmpty && figures.allSatisfy { $0.value.isEmpty }
    }
}
