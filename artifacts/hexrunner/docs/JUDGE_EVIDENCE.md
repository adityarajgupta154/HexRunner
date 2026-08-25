# HexRunner judge evidence checklist

Complete this checklist from the same account and iQOO phone used for the
hackathon. Keep the executed Colab notebook, video, and terms screenshots in
the team's private submission folder; do not commit personal or authenticated
material to this repository.

## 1. Local AI — executed Colab evidence

1. Open Google Colab and upload `scripts/hexrunner_fitness_colab.ipynb`.
2. Run all cells.
3. When prompted, upload:
   - `scripts/train_fitness_model.py`
   - `src/models/fitnessWeights.json`
4. Keep the final cell visible. It must show:
   - `Dataset: 500 synthetic samples (125 per tier)`
   - `Training: 2,000 epochs`
   - an exported `colabFitnessWeights.json` path and SHA-256 digest
   - `BYTE-FOR-BYTE MATCH: True`
   - the final `PASS` line
5. In Colab, use **File → Download → Download .ipynb**. Save one screenshot
   that includes the output above and the Colab interface.

If the comparison fails, do not edit either JSON by hand. Download the Colab
export, replace `src/models/fitnessWeights.json`, run the notebook again, and
retain the successful second run.

## 2. iQOO backup demo — one continuous recording

Prepare two test runners so the phone can enter a hex currently owned by the
other runner. Start recording before opening HexRunner, and keep the phone's
status bar visible enough to identify a real device recording.

- [ ] Open HexRunner on the iQOO phone
- [ ] Tap **Start**
- [ ] Move through multiple cells and show live teal claims
- [ ] Enter the prepared opponent-owned cell and show one takeover
- [ ] Tap **Stop**
- [ ] Show the saved **Summary**, including claimed and stolen territory
- [ ] Open **Leaderboard** and show the runner's persisted ranking
- [ ] Open **Profile** and show totals plus the recent run
- [ ] End the recording only after the recent run is visible

Before retaining the final take, replay it once with sound on and confirm that
all labels are readable, the takeover is visible, and no notification exposes
private information.

## 3. Authenticated event guide and terms

Public event information was checked on 25 August 2026 at:

- <https://iqoo.reskilll.com/>

The public page described 30-hour city battles, a phone-first build, local or
open-source models, Red/Green device windows, HackTracker, and city-specific
dates. Public copy can change and does not replace the logged-in guide.

Immediately before submission, sign in to the registered Reskilll/iQOO account
and retain screenshots or a downloaded copy confirming:

- [ ] Registered city, venue, and exact event start/end time
- [ ] Submission opening time and hard deadline
- [ ] Red Light and Green Light windows, including what each device may do
- [ ] Whether pre-event code, datasets, and trained weights are allowed
- [ ] Required local/open-source AI evidence and any model restrictions
- [ ] Demo must run on the supplied iQOO phone
- [ ] Team-size and student/working-professional eligibility
- [ ] Required repository, deck, video, APK/build, or live-demo links
- [ ] Judging rubric, HackTracker/Office Kit scoring, and checkpoint times
- [ ] IP, licensing, privacy, and disqualification terms

Record the review without copying private account details into this repository:

- Review date/time:
- Registered city/event:
- Guide or terms version/date:
- Submission deadline:
- Build window:
- Key restrictions:
- Required deliverables:
- Evidence saved at: