import profileShot from '@assets/image_1787757033449.png';

export default function Impact() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg px-[5.5vw] py-[5vh] font-body text-text hex-grid">
      <div className="flex items-end justify-between"><div><p className="text-[1.5vw] font-bold tracking-[0.16em] text-primary">TARGET AUDIENCE + OUTCOMES</p><h1 className="font-display text-[4.4vw] font-extrabold tracking-[-0.04em]">IMPACT AND BENEFITS</h1></div><p className="text-[1.5vw] font-bold text-muted">05 / 06</p></div>
      <div className="mt-[4vh] grid h-[74vh] grid-cols-[0.68fr_1.32fr] gap-[4vw]">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-[58vh] w-[25vw] rounded-full bg-primary/10 blur-[3vw]" />
          <img src={profileShot} crossOrigin="anonymous" alt="HexRunner progress and profile screen" className="relative max-h-[67vh] max-w-[27vw] rounded-[2vw] border border-white/20 object-contain" />
        </div>
        <div className="grid grid-cols-2 gap-[1.5vw] self-center">
          <div className="border-t-[0.5vh] border-primary bg-[#10252a] p-[1.6vw]"><p className="font-display text-[2.25vw] font-bold">USER</p><p className="mt-[1vh] text-[1.85vw] leading-[1.2]">Visible goals, streaks, territory and fair progress make outdoor exercise more engaging.</p></div>
          <div className="border-t-[0.5vh] border-accent bg-[#211c13] p-[1.6vw]"><p className="font-display text-[2.25vw] font-bold">SOCIAL</p><p className="mt-[1vh] text-[1.85vw] leading-[1.2]">Privacy-aware nearby activity, waves and contests create lightweight community competition.</p></div>
          <div className="border-t-[0.5vh] border-accent bg-[#211c13] p-[1.6vw]"><p className="font-display text-[2.25vw] font-bold">HEALTH</p><p className="mt-[1vh] text-[1.85vw] leading-[1.2]">AQI context, suggested exercise windows and voice cues support informed movement.</p></div>
          <div className="border-t-[0.5vh] border-primary bg-[#10252a] p-[1.6vw]"><p className="font-display text-[2.25vw] font-bold">CIVIC</p><p className="mt-[1vh] text-[1.85vw] leading-[1.2]">Coarse unsafe-area and civic reports help surface local signals without publishing exact routes.</p></div>
          <div className="col-span-2 flex items-center justify-between rounded-[1vw] border border-white/15 bg-black/25 px-[1.7vw] py-[1.8vh]">
            <p className="max-w-[35vw] text-[1.8vw] font-semibold leading-[1.2]"><span className="text-primary">EQUITY BY DESIGN</span> · Cold-zone rewards encourage movement beyond already popular areas.</p>
            <p className="max-w-[22vw] text-right text-[1.6vw] text-muted">No adoption metrics or unsupported impact numbers claimed.</p>
          </div>
        </div>
      </div>
    </div>
  );
}