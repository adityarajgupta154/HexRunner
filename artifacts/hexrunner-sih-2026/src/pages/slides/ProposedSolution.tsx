import appShot from '@assets/image_1787756580341.png';

export default function ProposedSolution() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg px-[5.5vw] py-[5vh] font-body text-text hex-grid">
      <div className="flex items-end justify-between">
        <div><p className="text-[1.5vw] font-bold tracking-[0.16em] text-primary">IDEA TITLE</p><h1 className="mt-[0.5vh] font-display text-[4.4vw] font-extrabold tracking-[-0.04em]">PROPOSED SOLUTION</h1></div>
        <p className="mb-[1vh] text-[1.5vw] font-bold text-muted">02 / 06</p>
      </div>
      <div className="mt-[4vh] grid h-[74vh] grid-cols-[1.12fr_0.88fr] gap-[4vw]">
        <div className="flex flex-col">
          <p className="max-w-[50vw] text-[2.2vw] font-semibold leading-[1.18]">Running apps record distance. HexRunner turns movement into visible ownership—with safety and fairness built into the game loop.</p>
          <div className="mt-[4vh] grid grid-cols-2 gap-[1.4vw]">
            <div className="rounded-[1.2vw] border border-primary/35 bg-[#0d2427]/90 p-[1.5vw]"><p className="text-[1.6vw] font-bold text-primary">CAPTURE</p><p className="mt-[1vh] text-[1.85vw] leading-[1.2]">GPS movement crosses H3 hexes; eligible cells become territory.</p></div>
            <div className="rounded-[1.2vw] border border-white/15 bg-[#0d1b20]/90 p-[1.5vw]"><p className="text-[1.6vw] font-bold text-accent">COMPETE</p><p className="mt-[1vh] text-[1.85vw] leading-[1.2]">Nearby runners, contests and takeovers create live stakes.</p></div>
            <div className="rounded-[1.2vw] border border-white/15 bg-[#0d1b20]/90 p-[1.5vw]"><p className="text-[1.6vw] font-bold text-accent">MOVE SAFER</p><p className="mt-[1vh] text-[1.85vw] leading-[1.2]">AQI context, coarse advisories, SOS sharing and voice cues reduce screen dependence.</p></div>
            <div className="rounded-[1.2vw] border border-primary/35 bg-[#0d2427]/90 p-[1.5vw]"><p className="text-[1.6vw] font-bold text-primary">STAY FAIR</p><p className="mt-[1vh] text-[1.85vw] leading-[1.2]">Server validation checks time, accuracy, path integrity, mock signals and claim eligibility.</p></div>
          </div>
          <div className="mt-auto flex items-center gap-[1.2vw] border-t border-white/15 pt-[2.2vh] text-[1.65vw] font-semibold">
            <span className="text-primary">DIFFERENTIATOR</span><span className="text-muted">Fitness + territory + live privacy-aware competition + civic intelligence in one working loop.</span>
          </div>
        </div>
        <div className="relative flex items-center justify-center">
          <div className="absolute h-[66vh] w-[29vw] rounded-[3vw] bg-primary/10 blur-[3vw]" />
          <img src={appShot} crossOrigin="anonymous" alt="HexRunner mobile map interface" className="relative max-h-[70vh] max-w-[31vw] rounded-[2.1vw] border border-white/20 object-contain shadow-2xl" />
        </div>
      </div>
    </div>
  );
}