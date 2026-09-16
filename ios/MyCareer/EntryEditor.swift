import SwiftUI

struct EntryEditor: View {
    @Binding var entry: Entry
    @Environment(Store.self) private var store

    var body: some View {
        Form {
            Section {
                TextField("One flat sentence, no selling", text: $entry.text, axis: .vertical)
                    .lineLimit(1...4)
            } header: {
                Text("What it was")
            } footer: {
                Text("Neutral wording. This is the sentence you would send to a former colleague to check, so it cannot contain persuasion.")
            }

            Section {
                Picker("Your part in it", selection: $entry.agency) {
                    ForEach(Agency.allCases) { a in
                        Text(a.label).tag(a)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: {
                Text("Your part in it")
            } footer: {
                Text("These are three different claims. Letting one drift into another is the fastest way to get caught in a reference check.")
            }

            Section("The long version") {
                TextField("What actually happened", text: $entry.narrative, axis: .vertical)
                    .lineLimit(6...40)
            }

            PromptList(title: "What to answer here", prompts: Prompts.entry)

            Section("The constraint") {
                TextField("The pressure that made this necessary", text: $entry.constraint, axis: .vertical)
                    .lineLimit(2...8)
            }

            Section {
                TextField("The detail that pins it down", text: $entry.confirmedDetail, axis: .vertical)
                    .lineLimit(1...6)
            } header: {
                Text("The detail")
            } footer: {
                Text("A person, a date, an artifact name, a number, an argument. The specific thing nobody could have guessed.")
            }

            Section("The hard questions") {
                TextField("What went wrong or was left undone", text: $entry.whatWentWrong, axis: .vertical)
                    .lineLimit(2...10)
                TextField("Who could confirm it, and what part", text: $entry.couldConfirm, axis: .vertical)
                    .lineLimit(2...8)
            }

            PromptList(title: "Why these matter", prompts: Prompts.hard)

            Section {
                ForEach($entry.figures) { $f in
                    FigureRow(figure: $f)
                }
                .onDelete { entry.figures.remove(atOffsets: $0) }

                Button {
                    entry.figures.append(Figure())
                } label: {
                    Label("Add a number", systemImage: "plus")
                }
            } header: {
                Text("Numbers")
            } footer: {
                Text("A number without a baseline is decoration, and a number you cannot produce a source for gets left out rather than softened.")
            }
        }
        .navigationTitle("Entry")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { store.save() }
    }
}

private struct FigureRow: View {
    @Binding var figure: Figure

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("The number, as you would write it", text: $figure.value)
                .font(.headline)
            TextField("What it measures", text: $figure.what)
            TextField("What it was before", text: $figure.baseline)
            TextField("Where you could produce the source", text: $figure.source)
            Toggle("I can produce that source today", isOn: $figure.sourceable)
                .font(.callout)
            if !figure.value.isEmpty && !figure.sourceable {
                Label("Will be flagged on export", systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
        .font(.callout)
        .padding(.vertical, 4)
    }
}
