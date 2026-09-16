# myCareer for iOS

A career autobiography app. Write your career long-form, one chapter per role, with the
questions that pull specifics out of you sitting right next to the text field. Export to a
Markdown file you own.

**642 lines of Swift, 7 files, zero dependencies.** No network code, no analytics, no
accounts, no database. SwiftUI and Foundation only.

```
MyCareer/
  MyCareerApp.swift    13   app entry, owns the store
  Model.swift         110   every type, plus the prompt sets
  Store.swift          96   file IO, debounced autosave, export
  Markdown.swift      102   pure renderer
  ContentView.swift   130   root list and the export sheet
  RoleEditor.swift     86   chapter editing
  EntryEditor.swift   106   entry and figure editing
```

## Storage

One JSON file, written atomically with file protection:

```
<app>/Documents/mycareer.json
<app>/Documents/<name>-autobiography-<date>.md      written on export
```

`UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` are both set, so Documents
appears in the Files app under **On My iPhone → MyCareer**. Both files are reachable,
copyable, and readable without this app installed, which is the point: the record is yours,
and nothing about it depends on the app continuing to exist.

Export also offers a share sheet, so Save to Files, AirDrop, and Mail all work.

Field names match the desktop myCareer vocabulary (`chapter`, `narrative`, `constraint`,
`agency`, `confirmedDetail`, `sourceable`), so converting this JSON into a full corpus for the
Claude Code plugin is a field mapping rather than a redesign.

## Build

Requires macOS with Xcode 15 or later. Deployment target is iOS 17 (the app uses
`@Observable`; dropping to iOS 16 means converting `Store` to `ObservableObject`).

**With XcodeGen**

```bash
brew install xcodegen
cd ios && xcodegen && open MyCareer.xcodeproj
```

XcodeGen writes `MyCareer/Info.plist` from `project.yml`, adding the required bundle keys.
Edit the keys in `project.yml`, not in the generated file.

**Without XcodeGen**

1. Xcode → New Project → iOS → App. Name it `MyCareer`, interface SwiftUI, language Swift.
2. Delete the generated `ContentView.swift` and `MyCareerApp.swift`.
3. Drag the seven Swift files, `Assets.xcassets`, and `PrivacyInfo.xcprivacy` from `ios/MyCareer/` into the target.
4. In target settings → Info, add two boolean rows set to YES:
   `Application supports iTunes file sharing` (`UIFileSharingEnabled`) and
   `Supports opening documents in place` (`LSSupportsOpeningDocumentsInPlace`).
5. Set the deployment target to iOS 17.

## Submitting to the App Store

- **Apple Developer Program**, 99 USD per year. Required before anything reaches TestFlight
  or the store.
- **Privacy nutrition label: Data Not Collected.** True here, and worth keeping true. There is
  no network code in this app; adding any analytics SDK would change the label and the review.
- **A privacy policy URL is still required** in App Store Connect even for an app that collects
  nothing. A short page saying data stays on the device is sufficient.
- **Guideline 4.2, minimum functionality, is the real submission risk.** A text editor with an
  export button gets rejected as "not enough to be an app." What answers that objection is the
  interrogation structure: the prompt sets, the agency distinction, the sourceable flag, and the
  export that separates defensible numbers from undefended ones. Lead the review notes with
  that, and with a filled-in sample export, rather than with screenshots of empty text fields.
- **Screenshots need real content.** Write one full chapter before capturing them. Empty-state
  screenshots read as an unfinished app to reviewers and buyers alike.
- Expect a binary of a few megabytes. There is nothing to strip.

## Testing

There is no way to emulate iOS on Windows or Linux. The Simulator is a macOS-only part of
Xcode and Apple ships no iOS SDK for other platforms, so UI testing genuinely requires a Mac.
What does not require one is the logic, which is where the bugs have actually been:

```bash
npm test              # golden-file tests, any machine with Node
npm run test:update   # rewrite the goldens after an intentional renderer change
```

`Tests/Fixtures/*.json` are app documents; `Tests/Golden/*.md` are their expected exports.
Two implementations are pinned to those same files:

- `Tests/harness/render.js` is a statement-for-statement port of `Markdown.swift`, so the
  export can be checked on any machine.
- `Tests/MyCareerTests.swift` renders the same fixtures through the real Swift and asserts
  identical bytes, plus behavioural tests for empty-entry skipping, unsourced-figure
  flagging, ordering stability, and JSON round-tripping.

If the two disagree, **the Swift is right** and the port is what drifted. Run ⌘U on a Mac
after any renderer change; passing the Node harness alone only proves the port agrees with
itself.

Writing the harness found two real bugs before a line of Swift was ever compiled: roles
sharing a start date could order differently in Swift than in JS, because Swift's sort is
not stable and needed an explicit tiebreak; and an empty name rendered the title
"Career Autobiography: Career Autobiography". Both are fixed in both implementations.

## Store submission

See [../store/CHECKLIST.md](../store/CHECKLIST.md). The icon, asset catalog, privacy
manifest, listing metadata, review notes, and privacy policy page are all built; what remains
needs a Mac or an Apple Developer account.

## What has not been verified

The Swift has not been compiled: it was written on Windows, and building it requires a Mac.
The export logic *was* verified by porting `Markdown.swift` line for line to JavaScript and
rendering the desktop example corpus through it, so the output format is known good. Expect
the first Xcode build to surface small things, most likely around the iOS 17 `@Observable`
and `onChange` signatures.

## Deliberately absent

No iCloud sync, no accounts, no sharing between devices, no AI in the app. The interrogation
that makes the record good happens in a conversation with Claude; this app is where the
answers live afterward, and where they stay when the subscription lapses.
