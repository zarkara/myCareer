# Setting this up in ChatGPT

Works on a personal ChatGPT account. Five minutes, no Custom GPT to build and nothing to
publish. You create a Project, drop the files in, paste one block of instructions, and start a
chat inside it.

A Project is the right container because its files and its instructions apply to every chat
you start inside it. Your career record then accumulates across sessions instead of starting
over each time.

---

## 1. Create the project

In ChatGPT, open the left sidebar, click **Projects**, then **New project**. Name it
**myCareer**.

## 2. Add the files

Open the project and add these, using **Add files** (or drag them in):

| File | What it is |
|---|---|
| `INTERVIEW.md` | the interrogation protocol, all seven phases |
| `RENDER.md` | how documents get written from the record |
| `reference/mycareer.schema.json` | the shape of the record |
| `reference/adjacency.json` | regulatory regimes and how they neighbour each other |
| `reference/sample-corpus.json` | a worked example, useful for trying rendering first |

Leave `mycareer.py` out of the project files for now. See step 5.

## 3. Paste the instructions

In the project, open **Instructions** and paste the entire contents of
`project-instructions.txt`.

**Do not put these in a file instead.** Project files are searched when ChatGPT thinks they are
relevant; the instructions field is present on every single turn. The rules that stop the model
inventing achievements have to be in the field that is always there, or they will sometimes
simply not apply.

## 4. Start a chat inside the project

Click **New chat** from inside the project, not from the sidebar. A chat started outside the
project cannot see any of this.

Open with something like:

> Interview me about my time at [employer] as [title], roughly [years]. I want to reconstruct
> what I actually did there.

Or, to see the output side first without writing anything about yourself:

> Read reference/sample-corpus.json and show me what a rendered resume looks like for the
> architect_director target.

## 5. Running the checks

When you want the record validated or documents rendered, **attach `mycareer.py` and your
corpus file to the message itself**, then ask:

> Run the validator on this corpus, then render the document set, then verify the output
> against the record.

Attaching to the message puts both files where the Python tool can reach them. Project files
are reliable for reading and searching; attaching to the message is reliable for running.

The three commands, if you want to ask for them by name:

```
python mycareer.py validate corpus.json
python mycareer.py render corpus.json <target-key> documents
python mycareer.py validate corpus.json documents/*.md
```

The third one is the point of the whole thing. Every number printed in a document must trace
back to a confirmed, sourceable figure, and nothing on the do-not-claim list may survive into a
draft. If it reports an error, the documents do not go out.

## 6. Keeping the record

At the end of a session, ask for the corpus as a JSON file and download it. Upload it again
next time you work on it. That file is the asset; the documents are disposable renders of it.

---

## Differences from the Claude version

The product is the same. Three things about the wrapper differ, and one of them matters:

- **Project files are retrieved, not always loaded.** Claude's skill loads its instructions in
  full on every turn. That is why the non-negotiable rules live in the instructions field here,
  and only the reference material lives in files.
- **The scripts are Python.** ChatGPT's code tool runs Python, not Node. `mycareer.py` is a
  port of the JavaScript original and produces byte-identical documents; the two were diffed
  across every document and both positioning targets.
- **Rendering produces Markdown, not Word files.** No package installs are possible in the
  sandbox, so the renderer emits Markdown you can paste anywhere.

## If something goes wrong

**It writes a bullet you never said.** That is the failure this whole thing exists to prevent.
Copy the exchange and send it back; it is the most useful thing a tester can find.

**It forgets the rules partway through a long session.** Say "re-read the project instructions"
and carry on, then tell me it happened. That is retrieval behaviour worth knowing about.

**The Python tool is not available.** Check that the code tool is enabled for your account. The
interview still works without it; only the automated verification does not, and ChatGPT should
tell you it is checking by hand instead.
