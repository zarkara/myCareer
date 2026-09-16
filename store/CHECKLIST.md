# App Store submission checklist

Everything that could be built without a Mac is in this folder and in `ios/`. The rest is
marked **Mac** or **you**, with nothing hidden behind a vague "configure signing" step.

## Ready

- [x] `ios/MyCareer/Assets.xcassets/AppIcon.appiconset/icon-1024.png` — 1024×1024, RGB, **no alpha** (an icon with transparency is rejected). Regenerate with `node store/make_icon.js`. It is a decent placeholder, not a designed mark; replace it before you care about conversion.
- [x] Asset catalog with `AppIcon` and `AccentColor`.
- [x] `ios/MyCareer/PrivacyInfo.xcprivacy` — declares no tracking, no collected data, no required-reason APIs. All three are true today. **Adding any analytics SDK invalidates this file and your privacy label.**
- [x] `ITSAppUsesNonExemptEncryption = false` in `project.yml` — removes the export-compliance question from every submission.
- [x] `TARGETED_DEVICE_FAMILY = 1` — iPhone only. Supporting iPad means a second full screenshot set and a layout pass, for no benefit at version one.
- [x] Store metadata in `metadata/`, all within Apple's character limits (checked: name 28/30, subtitle 29/30, promo 169/170, keywords 93/100).
- [x] `review_notes.txt` — written specifically to answer Guideline 4.2. See below.
- [x] `privacy.html` — publish on GitHub Pages, then put the URL in `metadata/privacy_policy_url.txt` and App Store Connect.
- [x] Tests: `node ios/Tests/harness/run.js` on any machine, `MyCareerTests.swift` on a Mac.

## Mac required

- [ ] **Build and run.** `cd ios && xcodegen && open MyCareer.xcodeproj`. Expect small compile fixes on first build; the Swift has never been compiled.
- [ ] **Run the Swift tests** (⌘U). They render the same fixtures as the Node harness and compare against the same golden files. If they disagree, `Markdown.swift` is right and `Tests/harness/render.js` is the one that drifted.
- [ ] **Set `DEVELOPMENT_TEAM`** in `project.yml` to your 10-character Team ID, and pick a real bundle identifier. `com.example.mycareer` will not archive.
- [ ] **Screenshots.** 6.7" or 6.9" iPhone, portrait. Required sizes change; take them from the Simulator at whatever size App Store Connect currently asks for. **Fill in a real chapter first** — empty-state screenshots read as an unfinished app to reviewers and to buyers.
- [ ] **Archive and upload** via Xcode Organizer or `xcrun altool`.

## You

- [ ] **Apple Developer Program**, $99/year. Nothing reaches TestFlight or the store without it.
- [ ] **App name availability.** "myCareer" alone is almost certainly taken; `metadata/name.txt` uses "myCareer: Work Autobiography". Check in App Store Connect before you get attached to it.
- [ ] **Privacy label: Data Not Collected.** Answer the App Store Connect questionnaire accordingly. It is true, it is a real differentiator for an app asking people to type their whole career into it, and it is worth protecting.
- [ ] **Age rating** questionnaire: all no, rates 4+.
- [x] **URLs point at the real repo** in `metadata/support_url.txt`, `metadata/privacy_policy_url.txt`, and `privacy.html`. The privacy policy URL only resolves once GitHub Pages is switched on for `/site`.

## The one real rejection risk

**Guideline 4.2, Minimum Functionality.** A text editor with an export button gets
rejected as "not enough to be an app." This is the likeliest reason for a first
rejection, and it is answerable.

`review_notes.txt` is written to answer it directly: the prompt sets, the three-way
agency distinction, the provenance flag on every number, and an export that separates
defensible figures from undefended ones. It also walks the reviewer through producing
that behavior in four steps, because a reviewer who opens an empty app and taps around
for ninety seconds will see a notes app.

Do not submit with empty screenshots. That is the same argument, made badly.

## Minor

- Bundle size will be a few megabytes. There is nothing to strip: no dependencies, no
  assets beyond one icon.
- `whats_new.txt` says "First release." Replace it on every update or the field looks
  neglected.
