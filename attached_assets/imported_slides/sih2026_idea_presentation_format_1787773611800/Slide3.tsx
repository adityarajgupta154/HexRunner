import React, { useState, useEffect, useRef } from "react";
import img_1 from "./assets/images/image_2.png";
const Slide3: React.FC = () => {
  const outerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    s: 1,
    x: 0,
    y: 0
  });
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = Math.min(w / 1280, h / 720);
      setLayout({
        s,
        x: (w - 1280 * s) / 2,
        y: (h - 720 * s) / 2
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div id="slide-3" ref={outerRef} className="w-screen h-screen overflow-hidden relative" style={{
    backgroundColor: "#000"
  }}><div id="slide-inner-3" style={{
      position: "absolute",
      width: "1280px",
      height: "720px",
      overflow: "hidden",
      transformOrigin: "top left",
      color: "#000000",
      backgroundColor: "#ffffff",
      transform: `scale(${layout.s})`,
      left: layout.x + "px",
      top: layout.y + "px"
    }}><div key={0} style={{
        position: "absolute",
        left: "0px",
        top: "667.17px",
        width: "1280px",
        height: "52.83px",
        boxSizing: "border-box",
        backgroundColor: "#0070C0",
        boxShadow: "0px 2.41px 0px rgba(128, 128, 128, 0.35)"
      }} /><div key={1} style={{
        position: "absolute",
        left: "64px",
        top: "-5px",
        width: "1152px",
        height: "120px",
        boxSizing: "border-box",
        backgroundColor: "transparent",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "4.8px 9.6px 4.8px 9.6px",
        wordWrap: "break-word"
      }}><p style={{
          textAlign: "center",
          lineHeight: "1.2",
          fontSize: "calc(36pt * var(--pptx-font-scale, 1))",
          marginTop: "0",
          marginBottom: "0"
        }}><span style={{
            fontSize: "calc(36pt * var(--pptx-font-scale, 1))",
            fontFamily: "'Times New Roman', Times, serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"TECHNICAL APPROACH"}</span></p></div><div key={2} style={{
        position: "absolute",
        left: "64px",
        top: "266px",
        width: "985.33px",
        height: "190.64px",
        boxSizing: "border-box",
        backgroundColor: "transparent",
        padding: "4.8px 9.6px 4.8px 9.6px",
        wordWrap: "break-word"
      }}><p style={{
          textAlign: "justify",
          lineHeight: "1.2",
          textIndent: "-36px",
          paddingLeft: "36px",
          fontSize: "calc(28pt * var(--pptx-font-scale, 1))",
          marginTop: "0",
          marginBottom: "0"
        }}><span style={{
            marginRight: "8px"
          }}>{"\u2022"}</span><span style={{
            fontSize: "calc(28pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif"
          }}>{"Technologies to be used (e.g. programming languages, frameworks, hardware)"}</span></p><p style={{
          textAlign: "justify",
          lineHeight: "1.2",
          textIndent: "-36px",
          paddingLeft: "36px",
          fontSize: "calc(28pt * var(--pptx-font-scale, 1))",
          marginTop: "0",
          marginBottom: "0"
        }}><span style={{
            marginRight: "8px"
          }}>{"\u2022"}</span><span style={{
            fontSize: "calc(28pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif"
          }}>{"Methodology and process for implementation (Flow Charts/Images/ working prototype)"}</span></p></div><div key={3} style={{
        position: "absolute",
        left: "488px",
        top: "667.33px",
        width: "336.38px",
        height: "38.33px",
        boxSizing: "border-box",
        padding: "4.8px 9.6px 4.8px 9.6px",
        wordWrap: "break-word"
      }}><p style={{
          textAlign: "left",
          lineHeight: "1.2",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginTop: "0",
          marginBottom: "0"
        }}><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "'Calibri', 'Helvetica Neue', Arial, sans-serif",
            color: "#ffffff"
          }}>{"@SIH Idea submission- Template"}</span></p></div><div key={4} style={{
        position: "absolute",
        left: "34.62px",
        top: "26.48px",
        width: "131.43px",
        height: "84.76px",
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        borderRadius: "50%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "4.8px 9.6px 4.8px 9.6px",
        wordWrap: "break-word"
      }}><p style={{
          textAlign: "center",
          lineHeight: "1.2",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginTop: "0",
          marginBottom: "0"
        }}><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            color: "#000000"
          }}>{"Your Team Name"}</span></p></div><img key={5} src={img_1} alt="Picture 11" style={{
        position: "absolute",
        left: "1026.78px",
        top: "0.16px",
        width: "236.2px",
        height: "111.53px",
        boxSizing: "border-box",
        objectFit: "fill"
      }} /></div></div>;
};
export default Slide3;
