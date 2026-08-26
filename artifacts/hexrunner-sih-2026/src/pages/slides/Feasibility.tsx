export default function Feasibility() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg px-[5vw] py-[4.8vh] font-body text-text hex-grid">
      <div className="flex items-end justify-between"><div><p className="text-[1.5vw] font-bold tracking-[0.16em] text-primary">ARCHITECTURE + RISK CONTROL</p><h1 className="font-display text-[4.2vw] font-extrabold tracking-[-0.04em]">FEASIBILITY AND VIABILITY</h1></div><p className="text-[1.5vw] font-bold text-muted">04 / 06</p></div>
      <div className="mt-[3vh] grid grid-cols-[1.1fr_0.9fr] gap-[3vw]">
        <div>
          <p className="text-[1.55vw] font-bold tracking-[0.12em] text-accent">WORKING DATA FLOW</p>
          <div className="mt-[1.5vh] grid grid-cols-3 gap-[1vw] text-center">
            <div className="rounded-[1vw] border border-primary/35 bg-[#10252a] p-[1.25vw]"><p className="text-[1.75vw] font-bold">EXPO APP</p><p className="mt-[0.8vh] text-[1.5vw] text-muted">GPS · map · safety · voice</p></div>
            <div className="rounded-[1vw] border border-primary/35 bg-[#10252a] p-[1.25vw]"><p className="text-[1.75vw] font-bold">TYPED API</p><p className="mt-[0.8vh] text-[1.5vw] text-muted">Zod contract · React Query</p></div>
            <div className="rounded-[1vw] border border-primary/35 bg-[#10252a] p-[1.25vw]"><p className="text-[1.75vw] font-bold">EXPRESS</p><p className="mt-[0.8vh] text-[1.5vw] text-muted">Validation · presence · AQI</p></div>
          </div>
          <div className="my-[1vh] text-center text-[2.2vw] font-bold text-primary">→ &nbsp;&nbsp;&nbsp;&nbsp; →</div>
          <div className="grid grid-cols-2 gap-[1vw] text-center">
            <div className="rounded-[1vw] border border-accent/40 bg-[#211c13] p-[1.25vw]"><p className="text-[1.75vw] font-bold">POSTGRESQL</p><p className="mt-[0.8vh] text-[1.5vw] text-muted">Runs · points · ownership · TTL presence</p></div>
            <div className="rounded-[1vw] border border-accent/40 bg-[#211c13] p-[1.25vw]"><p className="text-[1.75vw] font-bold">OPEN-METEO</p><p className="mt-[0.8vh] text-[1.5vw] text-muted">US AQI · forecast window · stale fallback</p></div>
          </div>
          <div className="mt-[2vh] rounded-[1vw] border border-white/15 bg-black/20 p-[1.4vw] text-[1.65vw] leading-[1.25]">
            <p><span className="font-bold text-primary">LIVE LOOP</span> Short-lived, rate-limited presence heartbeat → privacy-filtered nearby view.</p>
            <p className="mt-[1vh]"><span className="font-bold text-accent">SAVE LOOP</span> Queued run → authenticated API → server recomputation → transactional ownership update.</p>
          </div>
        </div>
        <div>
          <p className="text-[1.55vw] font-bold tracking-[0.12em] text-accent">RISKS → EXISTING MITIGATIONS</p>
          <div className="mt-[1.5vh] space-y-[1.25vh]">
            <p className="rounded-[0.8vw] bg-white/[0.06] px-[1.4vw] py-[1.2vh] text-[1.65vw]"><span className="font-bold">GPS noise</span> → accuracy rejection + dwell/coverage qualification</p>
            <p className="rounded-[0.8vw] bg-white/[0.06] px-[1.4vw] py-[1.2vh] text-[1.65vw]"><span className="font-bold">Spoofing</span> → mocked-point checks + speed/path integrity + server authority</p>
            <p className="rounded-[0.8vw] bg-white/[0.06] px-[1.4vw] py-[1.2vh] text-[1.65vw]"><span className="font-bold">Connectivity</span> → on-device queues + retry + idempotent run saves</p>
            <p className="rounded-[0.8vw] bg-white/[0.06] px-[1.4vw] py-[1.2vh] text-[1.65vw]"><span className="font-bold">Privacy</span> → coarse safety areas + anonymous nearby positions + expiring presence</p>
            <p className="rounded-[0.8vw] bg-white/[0.06] px-[1.4vw] py-[1.2vh] text-[1.65vw]"><span className="font-bold">AQI outage</span> → cache + stale warning + explicit unavailable state</p>
            <p className="rounded-[0.8vw] bg-white/[0.06] px-[1.4vw] py-[1.2vh] text-[1.65vw]"><span className="font-bold">Battery / audio</span> → foreground lifecycle controls + optional on-device speech</p>
          </div>
          <p className="mt-[2vh] text-[1.65vw] font-semibold text-primary">Feasible now: mobile, API and persistence paths already exist in the working product.</p>
        </div>
      </div>
    </div>
  );
}