import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Check, ChevronRight, Circle, LocateFixed, LogIn, Zap } from "lucide-react";
import "./_group.css";

const steps = ["THE GRID", "YOUR COLOUR", "GPS LINK"];
export function Launch() {
  const [step, setStep] = useState(0);
  const [colour, setColour] = useState("#9cf04a");
  const [notice, setNotice] = useState(false);
  const next = () => step < 2 ? setStep(step + 1) : setNotice(true);
  return <main className="hr-shell hr-grid">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_12%,#174450_0%,transparent_42%),linear-gradient(155deg,#0b1b23,#081013_65%,#11170f)]"/>
    <div className="absolute -right-16 top-28 h-64 w-64 border border-[#92e8d1]/15 hr-hex" /><div className="absolute -right-7 top-[158px] h-44 w-44 border border-[#92e8d1]/20 hr-hex"/>
    <header className="relative z-10 flex items-center justify-between px-6 pt-7">
      <div className="flex items-center gap-2"><img src="/__mockup/images/hexrunner-mark-v2.svg" className="h-9 w-8" /><span className="hr-display text-[25px] tracking-[-.06em]">HEXRUNNER</span></div>
      <button onClick={()=>setNotice(true)} className="hr-mono text-[10px] tracking-[.14em] text-[#b9c8bf]">SKIP</button>
    </header>
    <div className="relative z-10 px-6 pt-16">
      <motion.div initial={{opacity:0,y:9}} animate={{opacity:1,y:0}} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#9cf04a] hr-pulse"/><span className="hr-mono text-[10px] tracking-[.2em] text-[#9cf04a]">NIGHT MODE / READY</span></motion.div>
      <AnimatePresence mode="wait">
      <motion.section key={step} initial={{opacity:0,x:18}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-18}} transition={{duration:.32}} className="pt-5">
        {step===0 && <><h1 className="hr-display text-[68px] leading-[.78]">RUN THE<br/><span className="text-[#9cf04a]">CITY.</span><br/>KEEP IT.</h1><p className="mt-6 w-64 text-[14px] leading-6 text-[#c5d0c8]">Your route is a boundary. Close the shape and the blocks inside become yours.</p></>}
        {step===1 && <><h1 className="hr-display text-[58px] leading-[.82]">MARK THE<br/><span style={{color:colour}}>MAP YOUR WAY.</span></h1><p className="mt-5 text-[14px] text-[#c5d0c8]">Your signal appears on every street you hold.</p><div className="mt-8 flex gap-3">{["#9cf04a","#26c9ff","#ffbd4a","#fa608a"].map(c=><button aria-label="Select territory colour" onClick={()=>setColour(c)} key={c} className={`h-12 w-12 hr-hex ${colour===c?"ring-2 ring-white ring-offset-4 ring-offset-[#0c171b]":""}`} style={{backgroundColor:c}}>{colour===c&&<Check size={17} className="mx-auto text-[#071013]"/>}</button>)}</div></>}
        {step===2 && <><div className="mt-1 grid h-28 w-28 place-items-center rounded-full border border-[#9cf04a]/45 bg-[#9cf04a]/10"><LocateFixed size={42} className="text-[#9cf04a] hr-pulse"/></div><h1 className="hr-display mt-7 text-[58px] leading-[.82]">FIND YOUR<br/><span className="text-[#9cf04a]">START LINE.</span></h1><p className="mt-5 w-72 text-[14px] leading-6 text-[#c5d0c8]">Location lets HexRunner draw your route precisely, block by block.</p></>}
      </motion.section></AnimatePresence>
    </div>
    <div className="absolute bottom-0 z-10 w-full bg-gradient-to-t from-[#081013] via-[#081013] to-transparent px-5 pb-6 pt-16">
      <div className="mb-5 flex gap-1.5">{steps.map((s,i)=><div key={s} className={`h-1 flex-1 ${i<=step?"bg-[#9cf04a]":"bg-[#d7ede4]/20"}`}/>)}</div>
      <button onClick={next} className="flex h-[58px] w-full items-center justify-between bg-[#9cf04a] px-5 text-[#081013] active:scale-[.98]"><span className="hr-display text-[22px]">{step===2?"ENABLE LOCATION":"CONTINUE"}</span><ArrowUpRight size={21}/></button>
      <button onClick={()=>setNotice(true)} className="mx-auto mt-4 flex items-center gap-2 text-xs text-[#c5d0c8] underline decoration-[#9cf04a] underline-offset-4"><LogIn size={14}/>Already running? Sign in</button>
    </div>
    <AnimatePresence>{notice&&<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}} className="hr-glass absolute bottom-24 left-5 right-5 z-30 flex items-center gap-3 p-4"><Zap size={18} className="text-[#9cf04a]"/><p className="text-xs font-medium">Your existing territory will restore when you sign in.</p><button onClick={()=>setNotice(false)}><ChevronRight size={17}/></button></motion.div>}</AnimatePresence>
  </main>;
}