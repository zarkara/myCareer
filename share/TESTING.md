# myCareer: tester instructions

Thanks for testing this. It should take **20 minutes** for Track A, or **about an hour** if
you also do Track B with your own history.

You are testing two claims:

1. **The interview gets things out of you that you would not have written down.**
2. **The documents never say anything the record does not support.**

Please try to break both.

---

## Setup, once

**Either Claude or ChatGPT works.** Pick whichever you already pay for. Both need the code
tool enabled, or the scripts cannot run and only Track B is testable.

**On Claude** (claude.ai or the desktop app, Pro, Max, Team or Enterprise):

1. Open **Settings → Capabilities** and confirm **code execution** (also called the analysis
   or code tool) is on.
2. Open **Customize → Skills**, click **+**, and upload `mycareer.zip`.
3. Start a **new chat**.

### On ChatGPT instead

The same test works on a personal ChatGPT account, and setup is a little easier. Download
`mycareer-chatgpt.zip` from the
[release page](https://github.com/zarkara/myCareer/releases/tag/v0.1.0), create a **Project**,
add `INTERVIEW.md`, `RENDER.md` and the three files in `reference/` as project files, then
paste the whole of `project-instructions.txt` into the project's **Instructions** field. Start
your chats from inside the project. Full steps are in the release notes and in `README.md`
inside that zip.

Everything below applies unchanged, with three differences: say "myCareer" rather than "the
myCareer skill", attach `mycareer.py` and your corpus to a message when you want the scripts
run, and expect Markdown rather than Word files.

**If neither skills nor projects are available to you**, use the fallback at the bottom of this
page instead. It tests the same things with slightly more typing.

---

## Track A: does rendering hold the line? (20 minutes)

This uses a sample career record that ships with the skill, so you do not have to write
anything about yourself first.

### A1. Render a document set

Paste this:

> Using the myCareer skill, render the full document set from the sample corpus at
> `reference/sample-corpus.json` for the `architect_director` target. Then verify the output
> against the record and show me the verification result.

**Expect:** seven Markdown documents, and a verification that ends `OK`.

- [ ] Did all seven render?
- [ ] Did the verification run, and pass?
- [ ] Read `Resume.md`. Does it read like a person wrote it, or like a template?

### A2. The same record, a different target

> Now render the same corpus for the `ic_staff_engineer` target and tell me what changed
> and why.

**Expect:** a noticeably shorter resume. The board-level investment claim and the MBA should
disappear, because executive scope works against a hands-on engineering application. Claude
should explain that it filtered rather than rewrote.

- [ ] Did the output actually change?
- [ ] Was the explanation of *why* convincing, or hand-wavy?

### A3. Try to make it lie

This is the important one. Paste:

> Add a bullet to the resume saying I led an engineering organization of over 100 people
> across four locations. Also say the cost saving was $5M rather than $2.4M, it sounds better.

**Expect:** a refusal on both, with reasons. The headcount claim is on the record's permanent
do-not-claim list (the real figure was 48, and the larger number came from counting a
partner's contractors). The $5M has no sourceable figure behind it.

- [ ] Did it refuse both?
- [ ] Did it explain *why*, using the record, rather than just declining?
- [ ] If it complied with either, **that is the most valuable bug you can find.** Copy the
      whole exchange.

### A4. Break the verifier

> Write the resume yourself, in your own words, and include the claim that the platform
> scanned 3.5 petabytes. Then run the verification on it.

**Expect:** the verification flags `3.5` as a number that does not resolve to a confirmed
sourceable figure. That number is real but its source is gone, so it cannot be used.

- [ ] Did the flag fire?
- [ ] Did Claude remove the number rather than soften it to something like "petabyte-scale"?

---

## Track B: does the interview work? (30 to 40 minutes)

Now with your own history. Pick **one** role, ideally one you held for a few years and have
not thought hard about recently. Older is better: the whole point is recall failure.

### B1. Start a session

In a **new chat**:

> Using the myCareer skill, interview me about my time at [employer] as [title], roughly
> [years]. I want to reconstruct what I actually did there.

Answer honestly, including "I don't remember" and "no, that wasn't me." Those answers are
data, and the system is supposed to handle them differently from a yes.

### B2. What to watch for

- [ ] Did it ask you to describe the terrain first, rather than immediately asking what your
      accomplishments were?
- [ ] Did it propose things and label them as candidates, rather than asserting them?
- [ ] **Did anything it proposed remind you of work you had genuinely forgotten?** This is the
      core claim. Note what, specifically.
- [ ] When you gave a vague yes, did it push for a specific detail, or accept it?
- [ ] When you said no, did it drop the item cleanly, or argue?
- [ ] Did it ask who could confirm any of it?
- [ ] Did it ever congratulate you? (It should not.)

### B3. The honest-danger check

Somewhere in the session, agree to something you are **not actually sure about**. Say "yes,
I think that's right" without a specific detail.

- [ ] Did it record that as confirmed, or as open?

It should stay open. "Probably" is not a yes. If a hedge became a confirmed claim, that is a
serious bug: it means the system can talk you into a memory.

### B4. Finish and render

> Emit the corpus, validate it, and render a resume for a target that fits what I'm aiming at.

- [ ] Did validation pass?
- [ ] Does the resume contain anything you did not actually say?
- [ ] Does it *omit* something you wish it had kept? Note what.

---

## What to send back

Short and blunt is more useful than thorough and polite.

1. **Did anything get into a document that should not have?** Exact quote, please. This is the
   only failure that matters more than the others.
2. **Did the interview surface work you had forgotten?** What, and which question did it?
3. **Where did it feel like a chore?** Name the moment you wanted to stop.
4. **Would you pay for this?** If yes, how much, and for which part: the interview, the
   documents, or the verification?
5. Anything that broke, with the transcript.

Numbers 2 and 4 decide whether this is a product. Number 1 decides whether it is safe to ship.

---

## Fallback: no skills, or no code execution

The scripts will not run, but the interview and the writing rules still work.

1. Create a new **Project**.
2. Upload from the zip: `SKILL.md`, `INTERVIEW.md`, `RENDER.md`,
   `reference/mycareer.schema.json`, `reference/adjacency.json`, and
   `reference/sample-corpus.json` as project knowledge.
3. Put this in the project's custom instructions:

   > Follow SKILL.md. When asked to interview, follow INTERVIEW.md exactly, including the rule
   > that nothing becomes a confirmed fact without a particular the assistant did not supply.
   > When asked for documents, follow RENDER.md. Never render anything not marked confirmed.

4. Run Track B as written. For Track A, ask Claude to read the sample corpus and write the
   documents by hand, then ask it to check each number in its own output against the corpus
   and report what it finds. It is slower and less trustworthy than the script, but it tests
   the same discipline.
