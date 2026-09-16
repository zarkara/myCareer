import SwiftUI

struct RoleEditor: View {
    @Binding var role: Role
    @Environment(Store.self) private var store

    var body: some View {
        Form {
            Section("The role") {
                TextField("Title", text: $role.title)
                TextField("Organization", text: $role.org)
                TextField("City, State", text: $role.location)
                HStack {
                    TextField("From (2018-11)", text: $role.start)
                    Text("to").foregroundStyle(.secondary)
                    TextField("Present", text: $role.end)
                }
                .font(.callout)
            }

            Section {
                TextField("Write the chapter", text: $role.chapter, axis: .vertical)
                    .lineLimit(8...40)
            } header: {
                Text("The chapter")
            } footer: {
                Text("Long form, in your own voice. This is the record; a resume bullet is a compression of it.")
            }

            PromptList(title: "What to answer here", prompts: Prompts.chapter)

            Section {
                ForEach($role.entries) { $entry in
                    NavigationLink {
                        EntryEditor(entry: $entry)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.text.isEmpty ? "Untitled entry" : entry.text)
                                .lineLimit(2)
                            Text(entry.agency.label)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { role.entries.remove(atOffsets: $0) }

                Button {
                    role.entries.append(Entry())
                } label: {
                    Label("Add something you did", systemImage: "plus")
                }
            } header: {
                Text("What you did here")
            } footer: {
                Text("One entry per thing worth defending. Fewer, deeper entries beat a long list.")
            }
        }
        .navigationTitle(role.heading.isEmpty ? "Chapter" : role.heading)
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { store.save() }
    }
}

/// The prompts are the point. They pull specifics out; they never answer for you.
struct PromptList: View {
    let title: String
    let prompts: [String]
    @State private var expanded = false

    var body: some View {
        Section {
            DisclosureGroup(isExpanded: $expanded) {
                ForEach(prompts, id: \.self) { p in
                    Text(p)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 2)
                }
            } label: {
                Label(title, systemImage: "questionmark.circle")
                    .font(.subheadline)
            }
        }
    }
}
