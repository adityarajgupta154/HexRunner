import hero from '@assets/ChatGPT_Image_Aug_26,_2026,_12_23_56_AM_1787684197392.png';
import logo from '@assets/generated_images/hexrunner_icon.png';

export default function TitleSlide() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text">
      <img src={hero} crossOrigin="anonymous" alt="Runner moving through a digital city territory grid" className="absolute inset-0 h-full w-full object-cover opacity-55" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,11,15,0.98)_0%,rgba(4,11,15,0.88)_48%,rgba(4,11,15,0.2)_100%)]" />
      <div className="absolute inset-0 hex-grid opacity-40" />
      <div className="relative flex h-full flex-col px-[6vw] py-[6vh]">
        <div className="flex items-center gap-[1.4vw]">
          <img src={logo} crossOrigin="anonymous" alt="HexRunner logo" className="h-[8vh] w-[8vh] rounded-[1.4vw]" />
          <div>
            <p className="font-display text-[1.6vw] font-bold tracking-[0.18em] text-primary">SMART INDIA HACKATHON 2026</p>
            <p className="mt-[0.6vh] text-[1.5vw] text-muted">IDEA SUBMISSION</p>
          </div>
        </div>
        <div className="mt-[12vh] max-w-[58vw]">
          <h1 className="font-display text-[7.4vw] font-extrabold leading-[0.88] tracking-[-0.06em]">HEX<span className="text-primary">RUNNER</span></h1>
          <p className="mt-[3vh] max-w-[48vw] text-[2.35vw] font-semibold leading-[1.15]">Turn every safe run into a fair, live territory game.</p>
        </div>
        <div className="mt-auto grid w-[62vw] grid-cols-2 gap-x-[4vw] gap-y-[1.6vh] border-t border-white/20 pt-[2.5vh] text-[1.55vw]">
          <p><span className="text-muted">Problem Statement ID</span> — [ENTER ID]</p>
          <p><span className="text-muted">Theme</span> — [ENTER THEME]</p>
          <p><span className="text-muted">Problem Statement Title</span> — [ENTER TITLE]</p>
          <p><span className="text-muted">PS Category</span> — [SOFTWARE / HARDWARE]</p>
          <p><span className="text-muted">Team ID</span> — [ENTER TEAM ID]</p>
          <p><span className="text-muted">Team Name</span> — [REGISTERED TEAM NAME]</p>
        </div>
      </div>
      <div className="absolute bottom-[4vh] right-[4vw] text-[1.5vw] font-bold text-white/55">01 / 06</div>
    </div>
  );
}