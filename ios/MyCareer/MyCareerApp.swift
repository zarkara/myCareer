import SwiftUI

@main
struct MyCareerApp: App {
    @State private var store = Store()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
        }
    }
}
