import React, { useState, useEffect, useRef } from "react";
import img_1 from "./assets/images/image_2.png";
const Slide7: React.FC = () => {
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
  return <div id="slide-7" ref={outerRef} className="w-screen h-screen overflow-hidden relative" style={{
    backgroundColor: "#000"
  }}><div id="slide-inner-7" style={{
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
        left: "488px",
        top: "667.33px",
        width: "336.38px",
        height: "38.33px",
        boxSizing: "border-box",
        padding: "4.8px 9.6px 4.8px 9.6px",
        wordWrap: "break-word"
      }}><p style={{
          textAlign: "center",
          lineHeight: "1.2",
          fontSize: "calc(12pt * var(--pptx-font-scale, 1))",
          marginTop: "0",
          marginBottom: "0"
        }}><span style={{
            fontSize: "calc(12pt * var(--pptx-font-scale, 1))",
            fontFamily: "'TradeGothic', sans-serif",
            color: "#FFFFFF"
          }}>{"@SIH Idea submission- Template"}</span></p></div><div key={2} style={{
        position: "absolute",
        left: "0px",
        top: "188.03px",
        width: "1280px",
        height: "453.46px",
        boxSizing: "border-box",
        backgroundColor: "#dce6f2",
        border: "4px solid #000000"
      }} /><div key={3} style={{
        position: "absolute",
        left: "38.62px",
        top: "201.1px",
        width: "1235.14px",
        height: "427.33px",
        boxSizing: "border-box",
        backgroundColor: "transparent",
        padding: "4.8px 9.6px 4.8px 9.6px",
        wordWrap: "break-word"
      }}><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          textIndent: "-54px",
          paddingLeft: "54px",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginTop: "0",
          marginBottom: "0"
        }}><span style={{
            marginRight: "8px",
            color: "#000000"
          }}>{"1."}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"Kindly keep the maximum slides limit up to six "}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#C00000"
          }}>{"(6). "}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"( Including the "}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"title slide) "}</span></p><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          marginTop: "10pt",
          textIndent: "-54px",
          paddingLeft: "54px",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginBottom: "0"
        }}><span style={{
            marginRight: "8px",
            color: "#000000"
          }}>{"2."}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"Try to avoid paragraphs and post your idea in points /diagrams / Infographics /pictures "}</span></p><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          marginTop: "10pt",
          textIndent: "-54px",
          paddingLeft: "54px",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginBottom: "0"
        }}><span style={{
            marginRight: "8px",
            color: "#000000"
          }}>{"3."}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"Keep your explanation precise and easy to understand"}</span></p><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          marginTop: "10pt",
          textIndent: "-54px",
          paddingLeft: "54px",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginBottom: "0"
        }}><span style={{
            marginRight: "8px",
            color: "#000000"
          }}>{"4."}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"Idea should be unique and novel. "}</span></p><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          marginTop: "10pt",
          textIndent: "-54px",
          paddingLeft: "54px",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginBottom: "0"
        }}><span style={{
            marginRight: "8px",
            color: "#000000"
          }}>{"5."}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"You can only use provided "}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"template"}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{" for making the "}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"PPT"}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{" without changing the idea details pointers (mentioned in previous slides)."}</span></p><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          marginTop: "10pt",
          textIndent: "-54px",
          paddingLeft: "54px",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginBottom: "0"
        }}><span style={{
            marginRight: "8px",
            color: "#000000"
          }}>{"6."}</span><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"You need to save the file in PDF and upload the same on portal. No PPT, Word Doc or any other format will be supported."}</span></p><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          marginTop: "10pt",
          textIndent: "-36.73px",
          paddingLeft: "54px",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginBottom: "0"
        }}><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))"
          }}>{"\xA0"}</span></p><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          marginTop: "10pt",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginBottom: "0"
        }}><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#C00000"
          }}>{"Note - You can delete this slide (Important Pointers) when you upload the details of your idea on SIH portal."}</span></p><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          marginTop: "5pt",
          textIndent: "-33.2px",
          paddingLeft: "96px",
          fontSize: "calc(20pt * var(--pptx-font-scale, 1))",
          marginBottom: "0"
        }}><span style={{
            fontSize: "calc(20pt * var(--pptx-font-scale, 1))"
          }}>{"\xA0"}</span></p></div><div key={4} style={{
        position: "absolute",
        left: "146.29px",
        top: "11.24px",
        width: "883px",
        height: "67.86px",
        boxSizing: "border-box",
        backgroundColor: "transparent",
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
            fontWeight: "700"
          }}>{"IMPORTANT INSTRUCTIONS"}</span></p></div><div key={5} style={{
        position: "absolute",
        left: "63.24px",
        top: "124.08px",
        width: "1003.43px",
        height: "35.87px",
        boxSizing: "border-box",
        backgroundColor: "transparent",
        padding: "4.8px 9.6px 4.8px 9.6px",
        wordWrap: "break-word"
      }}><p style={{
          textAlign: "justify",
          lineHeight: "1.08",
          fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
          marginTop: "0",
          marginBottom: "0"
        }}><span style={{
            fontSize: "calc(18pt * var(--pptx-font-scale, 1))",
            fontFamily: "Arial, 'Helvetica Neue', sans-serif",
            fontWeight: "700",
            color: "#000000"
          }}>{"Please ensure below pointers are met while submitting the Idea PPT:"}</span></p></div><img key={6} src={img_1} alt="Picture 12" style={{
        position: "absolute",
        left: "1026.78px",
        top: "0.16px",
        width: "236.2px",
        height: "111.53px",
        boxSizing: "border-box",
        objectFit: "fill"
      }} /></div></div>;
};
export default Slide7;
