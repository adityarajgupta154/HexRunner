export default function TechnicalApproach() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg px-[5vw] py-[4.8vh] font-body text-text hex-grid">
      <div className="flex items-end justify-between"><div><p className="text-[1.5vw] font-bold tracking-[0.16em] text-primary">METHODOLOGY + WORKING PROTOTYPE</p><h1 className="font-display text-[4.2vw] font-extrabold tracking-[-0.04em]">TECHNICAL APPROACH</h1></div><p className="text-[1.5vw] font-bold text-muted">03 / 06</p></div>
      <div className="mt-[4vh] grid grid-cols-4 gap-[1.3vw]">
        <div className="rounded-[1.2vw] bg-[#10252a] p-[1.5vw]"><p className="text-[1.5vw] font-bold text-primary">01 · ONBOARD</p><p className="mt-[1vh] text-[1.9vw] font-semibold leading-[1.18]">Create a local anonymous identity and fitness baseline.</p></div>
        <div className="rounded-[1.2vw] bg-[#10252a] p-[1.5vw]"><p className="text-[1.5vw] font-bold text-primary">02 · TRACK</p><p className="mt-[1vh] text-[1.9vw] font-semibold leading-[1.18]">Start a run; GPS records time, path, speed and accuracy.</p></div>
        <div className="rounded-[1.2vw] bg-[#10252a] p-[1.5vw]"><p className="text-[1.5vw] font-bold text-primary">03 · QUALIFY</p><p className="mt-[1vh] text-[1.9vw] font-semibold leading-[1.18]">H3 processing marks covered, poor-accuracy and contested cells.</p></div>
        <div className="rounded-[1.2vw] bg-[#10252a] p-[1.5vw]"><p className="text-[1.5vw] font-bold text-primary">04 · GUIDE</p><p className="mt-[1vh] text-[1.9vw] font-semibold leading-[1.18]">Live presence, safety signals, AQI and voice cues support the run.</p></div>
      </div>
      <div className="mx-auto my-[2.6vh] flex w-[88vw] items-center text-[2.2vw] font-bold text-accent"><span className="w-1/4 text-center">→</span><span className="w-1/4 text-center">→</span><span className="w-1/4 text-center">→</span><span className="w-1/4 text-center">↓</span></div>
      <div className="grid grid-cols-4 gap-[1.3vw]">
        <div className="rounded-[1.2vw] border border-accent/40 bg-[#211c13] p-[1.5vw]"><p className="text-[1.5vw] font-bold text-accent">08 · PROGRESS</p><p className="mt-[1vh] text-[1.9vw] font-semibold leading-[1.18]">See summary, claimed and stolen territory, streaks and ranking.</p></div>
        <div className="rounded-[1.2vw] border border-accent/40 bg-[#211c13] p-[1.5vw]"><p className="text-[1.5vw] font-bold text-accent">07 · REWARD</p><p className="mt-[1vh] text-[1.9vw] font-semibold leading-[1.18]">Apply daily claim budgets and cold-zone bonus credits.</p></div>
        <div className="rounded-[1.2vw] border border-accent/40 bg-[#211c13] p-[1.5vw]"><p className="text-[1.5vw] font-bold text-accent">06 · CAPTURE</p><p className="mt-[1vh] text-[1.9vw] font-semibold leading-[1.18]">Newer valid run wins claimable cells; takeovers are recorded.</p></div>
        <div className="rounded-[1.2vw] border border-accent/40 bg-[#211c13] p-[1.5vw]"><p className="text-[1.5vw] font-bold text-accent">05 · VALIDATE</p><p className="mt-[1vh] text-[1.9vw] font-semibold leading-[1.18]">Express recomputes claim quality and rejects inconsistent runs.</p></div>
      </div>
      <div className="mt-[4vh] flex items-center justify-between rounded-[1vw] border border-white/15 bg-black/20 px-[2vw] py-[1.7vh] text-[1.65vw]">
        <p><span className="font-bold text-primary">MOBILE</span> Expo + React Native + device GPS + on-device speech</p>
        <p><span className="font-bold text-accent">GEO</span> H3 indexing + path integrity + dwell/coverage checks</p>
      </div>
    </div>
  );
}