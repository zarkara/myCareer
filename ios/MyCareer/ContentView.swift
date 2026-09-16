import SwiftUI

struct ContentView: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    @State private var showExport = false

    var body: some View {
        @Bindable var store = store

        NavigationStack {
            List {
                Section("You") {
                    TextField("Name", text: $store.corpus.person.name)
                        .textContentType(.name)
                    TextField("How you describe yourself", text: $store.corpus.person.tagline, axis: .vertical)
                    TextField("City, State", text: $store.corpus.person.location)
                }

                Section {
                    ForEach($store.corpus.roles) { $role in
                        NavigationLink {
                            RoleEditor(role: $role)
                        } label: {
                            RoleRow(role: role)
                        }
                    }
                    .onDelete(perform: store.deleteRoles)

                    Button {
                        _ = store.addRole()
                    } label: {
                        Label("Add a chapter", systemImage: "plus")
                    }
                } header: {
                    Text("Chapters")
                } footer: {
                    Text("One chapter per role. Write it long. Everything shorter gets compressed from this later, and compression only runs one way.")
                }

                if let error = store.lastError {
                    Section("Could not save") { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("myCareer")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showExport = true } label: {
                        Label("Export", systemImage: "square.and.arrow.up")
                    }
                    .disabled(store.corpus.roles.isEmpty)
                }
            }
            .sheet(isPresented: $showExport) { ExportView() }
        }
        .onChange(of: store.corpus) { store.autosave() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { store.save() }
        }
    }
}

private struct RoleRow: View {
    let role: Role

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(role.heading.isEmpty ? "Untitled chapter" : role.heading)
                .font(.headline)
            Text(role.span)
                .font(.caption)
                .foregroundStyle(.secondary)
            if role.chapter.isEmpty && role.entries.isEmpty {
                Text("Nothing written yet")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            } else {
                Text("\(words(role)) words · \(role.entries.count) \(role.entries.count == 1 ? "entry" : "entries")")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
    }

    private func words(_ r: Role) -> Int {
        let text = ([r.chapter] + r.entries.map { "\($0.narrative) \($0.text)" }).joined(separator: " ")
        return text.split(whereSeparator: \.isWhitespace).count
    }
}

struct ExportView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var url: URL?
    @State private var text = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(text)
                    .font(.system(.footnote, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .navigationTitle("Export")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    if let url {
                        ShareLink(item: url) {
                            Label("Save", systemImage: "square.and.arrow.up")
                        }
                    }
                }
            }
            .task {
                text = Markdown.render(store.corpus)
                url = store.writeMarkdown()
            }
        }
    }
}
