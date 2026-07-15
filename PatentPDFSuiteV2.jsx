import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";

// In development Vite proxies /api to Flask. In production Flask serves this
// app and the API from the same HTTPS origin. VITE_API_URL is only needed when
// frontend and backend are intentionally deployed as separate services.
const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const apiUrl = (path) => `${API_BASE_URL}/api${path}`;

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  bg:"#0b0d12", surface:"#11141c", panel:"#171b26", border:"#222638",
  borderHover:"#363d5c", indigo:"#6366f1", indigoHover:"#818cf8",
  indigoDim:"#1e1b4b", indigoTint:"rgba(99,102,241,0.08)",
  teal:"#2dd4bf", tealDim:"#0d3d38", tealTint:"rgba(45,212,191,0.08)",
  text:"#e2e4f0", textSub:"#8b90b0", textMuted:"#4a5070",
  success:"#34d399", successDim:"#052e1c",
  warning:"#fbbf24", warningDim:"#3d2a00",
  danger:"#f87171", dangerDim:"#2d0a0a",
};

// ── Global CSS ─────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-track{background:${C.surface};}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
  @keyframes spin{to{transform:rotate(360deg);}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
  @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
  @keyframes glow{0%,100%{box-shadow:0 0 8px ${C.indigo}44;}50%{box-shadow:0 0 20px ${C.indigo}88;}}
  @keyframes slideRight{from{transform:translateX(-100%);}to{transform:translateX(0);}}
  @keyframes countUp{from{opacity:0;transform:scale(.8);}to{opacity:1;transform:scale(1);}}
  @keyframes ripple{0%{transform:scale(0);opacity:.6;}100%{transform:scale(4);opacity:0;}}
  @keyframes confettiFall{0%{transform:translateY(-10px) rotate(0deg);opacity:1;}100%{transform:translateY(300px) rotate(720deg);opacity:0;}}
  @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
  @keyframes tabSlide{from{opacity:0;transform:translateX(16px);}to{opacity:1;transform:none;}}
  @keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
  @keyframes borderGlow{0%,100%{border-color:${C.border};}50%{border-color:${C.indigo};}}
  code{font-family:'IBM Plex Mono',monospace;}
`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtBytes(b){if(b<1024)return b+" B";if(b<1048576)return(b/1024).toFixed(1)+" KB";return(b/1048576).toFixed(1)+" MB";}
function safeGet(obj,path,fb="—"){try{return path.split(".").reduce((o,k)=>o?.[k]??undefined,obj)??fb;}catch{return fb;}}

// ── Animated counter ───────────────────────────────────────────────────────────
function useCountUp(target, duration=800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let start = null;
    const from = 0;
    const step = (ts) => {
      if (!start) start = ts;
      const prog = Math.min((ts - start) / duration, 1);
      setVal(Math.round(from + (target - from) * prog));
      if (prog < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

// ── Typing animation ───────────────────────────────────────────────────────────
function useTyping(words, speed=80, pause=1800) {
  const [display, setDisplay] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const word = words[wordIdx];
    let timeout;
    if (!deleting && charIdx < word.length) {
      timeout = setTimeout(() => setCharIdx(c => c + 1), speed);
    } else if (!deleting && charIdx === word.length) {
      timeout = setTimeout(() => setDeleting(true), pause);
    } else if (deleting && charIdx > 0) {
      timeout = setTimeout(() => setCharIdx(c => c - 1), speed / 2);
    } else if (deleting && charIdx === 0) {
      setDeleting(false);
      setWordIdx(i => (i + 1) % words.length);
    }
    setDisplay(word.slice(0, charIdx));
    return () => clearTimeout(timeout);
  }, [charIdx, deleting, wordIdx, words, speed, pause]);
  return display;
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function Confetti({ active }) {
  const pieces = useMemo(() => Array.from({ length: 48 }, (_, i) => ({
    id: i, x: Math.random() * 100,
    color: [C.indigo, C.teal, C.success, C.warning, C.indigoHover][i % 5],
    delay: Math.random() * 0.8, duration: 1.5 + Math.random() * 1,
    size: 6 + Math.random() * 6, rotate: Math.random() * 360,
  })), []);
  if (!active) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.x}%`, top: -20,
          width: p.size, height: p.size, background: p.color, borderRadius: 2,
          animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          transform: `rotate(${p.rotate}deg)`,
        }} />
      ))}
    </div>
  );
}

// ── Ripple Button ─────────────────────────────────────────────────────────────
function RippleBtn({ children, onClick, disabled, style, variant = "primary" }) {
  const [ripples, setRipples] = useState([]);
  const btnRef = useRef();
  const handleClick = (e) => {
    if (disabled) return;
    const rect = btnRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const id = Date.now();
    setRipples(r => [...r, { id, x, y }]);
    setTimeout(() => setRipples(r => r.filter(rp => rp.id !== id)), 600);
    onClick?.(e);
  };
  const base = variant === "primary"
    ? { background: disabled ? C.border : C.indigo, color: disabled ? C.textMuted : "#fff", border: "none" }
    : { background: "none", color: disabled ? C.textMuted : C.textSub, border: `1px solid ${C.border}` };
  return (
    <button ref={btnRef} onClick={handleClick} disabled={disabled} style={{
      ...base, padding: "11px 22px", borderRadius: 8, fontSize: 12,
      fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.07em",
      textTransform: "uppercase", cursor: disabled ? "not-allowed" : "pointer",
      position: "relative", overflow: "hidden", transition: "all 0.2s",
      fontWeight: 600, ...style,
    }}>
      {ripples.map(rp => (
        <span key={rp.id} style={{
          position: "absolute", left: rp.x, top: rp.y,
          width: 8, height: 8, marginLeft: -4, marginTop: -4,
          background: "rgba(255,255,255,0.4)", borderRadius: "50%",
          animation: "ripple 0.6s ease-out forwards", pointerEvents: "none",
        }} />
      ))}
      {children}
    </button>
  );
}

// ── Stats Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color = C.indigo, animate = true }) {
  const displayed = useCountUp(animate ? value : 0);
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: "16px 20px", display: "flex", alignItems: "center", gap: 14,
      animation: "fadeUp 0.5s ease", transition: "border-color 0.2s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = color + "66"}
    onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "'IBM Plex Mono', monospace", animation: "countUp 0.4s ease" }}>{animate ? displayed : value}</div>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Backend Status Indicator ──────────────────────────────────────────────────
function BackendStatus() {
  const [status, setStatus] = useState("checking"); // checking | online | offline
  const [ping, setPing] = useState(null);
  const check = useCallback(async () => {
    setStatus("checking");
    const t = Date.now();
    try {
      const res = await fetch(apiUrl("/health"), { signal: AbortSignal.timeout(3000) });
      if (res.ok) { setStatus("online"); setPing(Date.now() - t); }
      else setStatus("offline");
    } catch { setStatus("offline"); setPing(null); }
  }, []);
  useEffect(() => { check(); const iv = setInterval(check, 15000); return () => clearInterval(iv); }, [check]);
  const cfg = {
    checking: { color: C.warning, dot: "pulse 1s infinite", label: "Checking…" },
    online:   { color: C.success, dot: "none",              label: `Backend online${ping ? ` · ${ping}ms` : ""}` },
    offline:  { color: C.danger,  dot: "pulse 1s infinite", label: "Backend offline · run pdf_server.py" },
  }[status];
  return (
    <div onClick={check} title="Click to recheck" style={{
      display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 999,
      padding: "5px 12px", transition: "border-color 0.2s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = cfg.color + "66"}
    onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
    >
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.color, animation: cfg.dot, boxShadow: `0 0 6px ${cfg.color}` }} />
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: cfg.color, letterSpacing: "0.05em" }}>{cfg.label}</span>
    </div>
  );
}

// ── Drop Zone ─────────────────────────────────────────────────────────────────
function DropZone({ onFile, accept, icon, title, hint, hasFile, isDragging, setIsDragging }) {
  const inputRef = useRef();
  const [shake, setShake] = useState(false);
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
    else { setShake(true); setTimeout(() => setShake(false), 500); }
  };
  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${hasFile ? C.teal : isDragging ? C.indigo : C.border}`,
        borderRadius: 14, padding: "36px 20px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        cursor: "pointer", textAlign: "center",
        background: isDragging ? C.indigoTint : hasFile ? C.tealTint : C.surface,
        transition: "all 0.25s",
        animation: shake ? "borderGlow 0.5s ease" : isDragging ? "glow 1s infinite" : "none",
      }}
    >
      <div style={{ fontSize: 36, animation: isDragging ? "float 1s ease-in-out infinite" : "none", transition: "transform 0.2s" }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{isDragging ? "Release to load" : title}</div>
      <div style={{ fontSize: 12, color: C.textMuted }}>{hint}</div>
      {isDragging && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {["detecting","validating","loading"].map((s, i) => (
            <span key={s} style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: C.indigo, background: C.indigoDim, padding: "2px 8px", borderRadius: 4, animationDelay: `${i * 0.2}s`, animation: "fadeIn 0.3s ease forwards", opacity: 0 }}>{s}</span>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); }} />
    </div>
  );
}

// ── File Chip ─────────────────────────────────────────────────────────────────
function FileChip({ file, onClear }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface, border: `1px solid ${C.teal}44`, borderRadius: 10, padding: "10px 14px", marginTop: 12, animation: "fadeUp 0.3s ease" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.teal, flexShrink: 0, boxShadow: `0 0 8px ${C.teal}`, animation: "pulse 2s infinite" }} />
      <div style={{ flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{fmtBytes(file.size)}</div>
      <button onClick={onClear} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textMuted, cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4, fontFamily: "'IBM Plex Mono', monospace", transition: "all 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.danger; e.currentTarget.style.color = C.danger; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}
      >CLEAR</button>
    </div>
  );
}

// ── Log Box ────────────────────────────────────────────────────────────────────
function LogBox({ logs }) {
  const ref = useRef();
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  if (!logs.length) return null;
  const icons = { ok: "✓", err: "✗", info: "ℹ", spin: "⟳" };
  const colors = { ok: C.success, err: C.danger, info: C.indigo, spin: C.warning };
  return (
    <div ref={ref} style={{ marginTop: 14, padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 160, overflowY: "auto" }}>
      {logs.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.9, color: C.textSub, animation: "fadeUp 0.2s ease" }}>
          <span style={{ color: colors[l.type], flexShrink: 0, animation: l.type === "spin" ? "spin 1s linear infinite" : "none" }}>{icons[l.type]}</span>
          <span>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, label }) {
  return (
    <div style={{ marginTop: 14 }}>
      {label && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted }}>
        <span>{label}</span><span>{pct}%</span>
      </div>}
      <div style={{ height: 4, background: C.border, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.indigo}, ${C.teal})`, borderRadius: 999, transition: "width 0.4s ease", boxShadow: `0 0 10px ${C.indigo}66` }} />
      </div>
    </div>
  );
}

// ── Error Box ─────────────────────────────────────────────────────────────────
function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ marginTop: 12, padding: "10px 14px", background: C.dangerDim, borderLeft: `3px solid ${C.danger}`, borderRadius: "0 8px 8px 0", fontSize: 13, color: C.danger, lineHeight: 1.6, animation: "fadeUp 0.3s ease" }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3, opacity: 0.7 }}>Error</div>
      {msg}
    </div>
  );
}

// ── Tag / Badge ────────────────────────────────────────────────────────────────
function Tag({ children, color = C.indigo, bg = C.indigoDim }) {
  return <span style={{ background: bg, color, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>{children}</span>;
}
function Badge({ children, type = "default" }) {
  const map = { default: [C.indigoDim, C.indigoHover], success: [C.successDim, C.success], warning: [C.warningDim, C.warning], danger: [C.dangerDim, C.danger], muted: [C.border, C.textMuted] };
  const [bg, color] = map[type] || map.default;
  return <span style={{ background: bg, color, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", padding: "3px 9px", borderRadius: 999, fontWeight: 600, letterSpacing: "0.05em" }}>{children}</span>;
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ children, style }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, ...style }}>{children}</div>;
}

// ── XLSX helpers ───────────────────────────────────────────────────────────────
function buildExcelWorkbook(data, fileLabel) {
  const amd = data.applicationMetaData || {}, events = data.eventDataBag || [], assignments = data.assignmentBag || [], inventors = amd.inventorBag || [], pta = data.patentTermAdjustmentData || {}, foreignPri = data.foreignPriorityBag || [], parentCont = data.parentContinuityBag || [], childCont = data.childContinuityBag || [];
  const aoa1 = [], merges1 = [], titleR = [], sectionR = [], altR = [];
  const pT = t => { aoa1.push([t,"","","",""]); titleR.push(aoa1.length-1); merges1.push({s:{r:aoa1.length-1,c:0},e:{r:aoa1.length-1,c:4}}); aoa1.push(["","","","",""]); };
  const pS = t => { aoa1.push([t,"","","",""]); sectionR.push(aoa1.length-1); merges1.push({s:{r:aoa1.length-1,c:0},e:{r:aoa1.length-1,c:4}}); };
  const pKV = (l,v,alt) => { aoa1.push([l,v??"—","","",""]); merges1.push({s:{r:aoa1.length-1,c:1},e:{r:aoa1.length-1,c:4}}); if(alt) altR.push(aoa1.length-1); };
  const sp = () => aoa1.push(["","","","",""]);
  pT(`PATENT SUMMARY — US ${amd.patentNumber||""}`);
  pS("BIBLIOGRAPHIC INFORMATION");
  [["Invention Title",amd.inventionTitle],["Patent Number",amd.patentNumber],["Grant Date",amd.grantDate],["Application Number",data.applicationNumberText],["Filing Date (US)",amd.filingDate],["Effective Filing Date",amd.effectiveFilingDate],["Earliest Publication Number",amd.earliestPublicationNumber],["Application Type",amd.applicationTypeLabelName],["Application Status",amd.applicationStatusDescriptionText],["Examiner Name",amd.examinerNameText],["Group Art Unit",amd.groupArtUnitNumber],["USPC Class/Subclass",`${amd.class||""}/${amd.subclass||""}`],["Entity Status",safeGet(amd,"entityStatusData.businessEntityStatusCategory")]].forEach(([l,v],i)=>pKV(l,v,i%2===0));
  sp(); pS("INVENTORS");
  inventors.forEach((inv,i)=>{ const a=(inv.correspondenceAddressBag||[{}])[0]; pKV(`Inventor ${i+1}`,`${inv.inventorNameText||""} (${a.cityName||""}, ${a.countryName||""})`,i%2===0); });
  if(!inventors.length) pKV("Inventors","—",false);
  sp(); pS("PRIORITY & CONTINUITY");
  let pcAlt=false;
  foreignPri.forEach(fp=>{ pKV("Foreign Priority",`${fp.applicationNumberText} — ${fp.ipOfficeName} (filed ${fp.filingDate})`,pcAlt); pcAlt=!pcAlt; });
  parentCont.forEach(pc=>{ pKV("Parent Application",`${pc.parentApplicationNumberText} — ${pc.claimParentageTypeCodeDescriptionText} (filed ${pc.parentApplicationFilingDate})`,pcAlt); pcAlt=!pcAlt; });
  if(childCont.length){ const pg=[...new Set(childCont.filter(c=>c.childPatentNumber).map(c=>c.childPatentNumber))].sort(); pKV("Child Apps",`${childCont.length} total, ${pg.length} granted`,pcAlt); }
  if(!foreignPri.length&&!parentCont.length&&!childCont.length) pKV("Priority & Continuity","No data on record",false);
  sp(); pS("CLASSIFICATION (CPC)"); pKV("CPC Codes",(amd.cpcClassificationBag||[]).join(", ")||"—",false);
  sp(); pS("PATENT TERM ADJUSTMENT (PTA)");
  [["A Delay (USPTO)",pta.aDelayQuantity],["B Delay (USPTO)",pta.bDelayQuantity],["C Delay (USPTO)",pta.cDelayQuantity],["Applicant Delay",pta.applicantDayDelayQuantity],["Total PTA (days)",pta.adjustmentTotalQuantity]].forEach(([l,v],i)=>pKV(l,v,i%2===0));
  sp(); pS("ASSIGNMENT / OWNERSHIP HISTORY");
  if(assignments.length){ assignments.forEach((a,i)=>{ const ae=(a.assigneeBag||[]).map(x=>x.assigneeNameText).join("; "); const ao=(a.assignorBag||[]).map(x=>x.assignorName).join("; "); pKV(`Assignment ${i+1}`,`${a.conveyanceText||""} | From: ${ao} | To: ${ae} | Recorded: ${a.assignmentRecordedDate||""}`,i%2===0); }); }
  else pKV("Assignments","No records found",false);
  const tF={patternType:"solid",fgColor:{rgb:"1F4E78"}}, sF={patternType:"solid",fgColor:{rgb:"2E75B6"}}, aF={patternType:"solid",fgColor:{rgb:"F2F2F2"}}, tb={bottom:{style:"thin",color:{rgb:"D9D9D9"}}};
  const ws1=XLSX.utils.aoa_to_sheet(aoa1); ws1["!merges"]=merges1; ws1["!cols"]=[{wch:28},{wch:40},{wch:16},{wch:28},{wch:20}];
  const sc=(ws,r,c,st)=>{ const addr=XLSX.utils.encode_cell({r,c}); if(!ws[addr])ws[addr]={t:"s",v:""}; ws[addr].s=Object.assign({},ws[addr].s,st); };
  titleR.forEach(r=>{for(let c=0;c<5;c++)sc(ws1,r,c,{font:{name:"Arial",sz:14,bold:true,color:{rgb:"FFFFFF"}},fill:tF,alignment:{horizontal:"center",vertical:"center"}});});
  sectionR.forEach(r=>{for(let c=0;c<5;c++)sc(ws1,r,c,{font:{name:"Arial",sz:11,bold:true,color:{rgb:"FFFFFF"}},fill:sF});});
  for(let r=0;r<aoa1.length;r++){ if(titleR.includes(r)||sectionR.includes(r))continue; if(aoa1[r].every(v=>v===""))continue; const alt=altR.includes(r); sc(ws1,r,0,{font:{name:"Arial",sz:10,bold:true},border:tb,fill:alt?aF:undefined}); sc(ws1,r,1,{font:{name:"Arial",sz:10},border:tb,fill:alt?aF:undefined}); }
  const aoa2=[["PROSECUTION HISTORY / EVENTS TIMELINE","","",""],["","","",""],["#","Event Date","Event Code","Event Description"]];
  [...events].sort((a,b)=>(a.eventDate||"").localeCompare(b.eventDate||"")).forEach((ev,i)=>aoa2.push([i+1,ev.eventDate||"",ev.eventCode||"",ev.eventDescriptionText||""]));
  if(!events.length) aoa2.push(["—","—","—","No events found"]);
  const ws2=XLSX.utils.aoa_to_sheet(aoa2); ws2["!merges"]=[{s:{r:0,c:0},e:{r:0,c:3}}]; ws2["!cols"]=[{wch:8},{wch:14},{wch:14},{wch:65}];
  for(let c=0;c<4;c++) sc(ws2,0,c,{font:{name:"Arial",sz:14,bold:true,color:{rgb:"FFFFFF"}},fill:tF,alignment:{horizontal:"center",vertical:"center"}});
  for(let c=0;c<4;c++) sc(ws2,2,c,{font:{name:"Arial",sz:10,bold:true,color:{rgb:"FFFFFF"}},fill:sF,border:tb,alignment:{horizontal:"center"}});
  for(let r=3;r<aoa2.length;r++){ const sh=typeof aoa2[r][0]==="number"&&aoa2[r][0]%2===0; for(let c=0;c<4;c++) sc(ws2,r,c,{font:{name:"Arial",sz:10},border:tb,fill:sh?aF:undefined}); }
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws1,"Patent Summary"); XLSX.utils.book_append_sheet(wb,ws2,"Prosecution History");
  XLSX.writeFile(wb,(fileLabel||"patent").replace(/\.json$/i,"").replace(/[^a-z0-9_\- ]/gi,"_")+"_summary.xlsx");
}

function readUrlsFromExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read Excel file."));
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
        if (!rows.length) { resolve([]); return; }
        const firstRow = rows[0];
        const urlKey = Object.keys(firstRow).find(k => k.trim().toLowerCase() === "url");
        const dateKey = Object.keys(firstRow).find(k => k.trim().toLowerCase() === "action date");
        if (!urlKey) { reject(new Error('No "Url" column found.')); return; }
        const items = rows.map((row, i) => {
          const url = String(row[urlKey] || "").trim();
          const rawDate = dateKey ? String(row[dateKey] || "").trim() : "";
          const d = new Date(rawDate); const date = !isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "";
          return {
            url,
            filename: date ? `${date}.pdf` : `row_${i+2}.pdf`,
            actionDate: date,
          };
        }).filter(item => item.url.startsWith("http"));
        resolve(items);
      } catch (err) { reject(new Error("Parse error: " + err.message)); }
    };
    reader.readAsBinaryString(file);
  });
}

async function downloadOnePdf(url, filename, actionDate = "") {
  let response;
  try { response = await fetch(apiUrl("/download-pdf"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, actionDate }) }); }
  catch { throw new Error("Cannot reach the PDF service. Please try again shortly."); }
  if (!response.ok) { let msg = `HTTP ${response.status}`; try { const j = await response.json(); msg = j.error || msg; } catch {} throw new Error(msg); }
  const blob = await response.blob();
  if (!blob.size) throw new Error("Empty response from server.");
  return { blob, filename };
}

async function saveToFolder(blob, filename, dirHandle) {
  let safeName = filename, counter = 1, fh;
  while (true) {
    try { await dirHandle.getFileHandle(safeName, { create: false }); const base = filename.replace(/\.pdf$/i, ""); safeName = `${base}_${counter++}.pdf`; }
    catch { fh = await dirHandle.getFileHandle(safeName, { create: true }); break; }
  }
  const w = await fh.createWritable(); await w.write(blob); await w.close(); return safeName;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename, style: "display:none" });
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}

const supportsFS = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

// ── Tab 1: JSON → Excel ────────────────────────────────────────────────────────
function JsonTab({ onConvert }) {
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState({ bib: true, inventors: false, priority: false, pta: false, assignments: false });
  const addLog = (text, type = "ok") => setLogs(l => [...l, { text, type }]);

  const handleFile = useCallback(f => {
    setError(null); setData(null); setLogs([]); setStage("idle");
    if (!f.name.toLowerCase().endsWith(".json")) { setError("Please upload a .json file."); return; }
    const reader = new FileReader();
    reader.onerror = () => setError("File could not be read.");
    reader.onload = e => {
      let parsed; try { parsed = JSON.parse(e.target.result); } catch { setError("Invalid JSON."); return; }
      if (!parsed.applicationMetaData) { setError("Not a USPTO patent export."); return; }
      setFile(f); setData(parsed); setStage("ready");
    };
    reader.readAsText(f);
  }, []);

  const reset = () => { setFile(null); setData(null); setError(null); setStage("idle"); setLogs([]); };

  const convert = useCallback(() => {
    if (!data) return;
    setStage("converting"); setLogs([]);
    const steps = ["Reading bibliographic data…","Resolving inventors & assignees…","Processing prosecution history…","Building Patent Summary sheet…","Building Prosecution History sheet…","Finalising workbook…"];
    let i = 0;
    const iv = setInterval(() => {
      addLog(steps[i]); i++;
      if (i >= steps.length) {
        clearInterval(iv);
        setTimeout(() => {
          try { buildExcelWorkbook(data, file.name); setStage("done"); addLog("✓ Workbook downloaded."); onConvert(); }
          catch (err) { setError(err.message); setStage("error"); }
        }, 300);
      }
    }, 300);
  }, [data, file, onConvert]);

  const amd = data?.applicationMetaData || {};

  const sections = data ? [
    { key: "bib", label: "Bibliographic Info", rows: [["Invention Title", amd.inventionTitle],["Patent Number", amd.patentNumber],["Grant Date", amd.grantDate],["Application Number", data.applicationNumberText],["Filing Date (US)", amd.filingDate],["Examiner", amd.examinerNameText],["Application Status", amd.applicationStatusDescriptionText],["Entity Status", safeGet(amd,"entityStatusData.businessEntityStatusCategory")]] },
    { key: "inventors", label: `Inventors (${(amd.inventorBag||[]).length})`, rows: (amd.inventorBag||[]).map((inv,i)=>{ const a=(inv.correspondenceAddressBag||[{}])[0]; return [`Inventor ${i+1}`, `${inv.inventorNameText||""} · ${[a.cityName,a.countryName].filter(Boolean).join(", ")}`]; }) },
    { key: "priority", label: "Priority & Continuity", rows: [...(data.foreignPriorityBag||[]).map(fp=>["Foreign Priority",`${fp.applicationNumberText} (${fp.filingDate})`]),...(data.parentContinuityBag||[]).map(pc=>["Parent",`${pc.parentApplicationNumberText}`])] },
    { key: "pta", label: "Patent Term Adjustment", rows: [["A Delay", (data.patentTermAdjustmentData||{}).aDelayQuantity],["Total PTA (days)", (data.patentTermAdjustmentData||{}).adjustmentTotalQuantity]] },
    { key: "assignments", label: `Assignments (${(data.assignmentBag||[]).length})`, rows: (data.assignmentBag||[]).map((a,i)=>[`Assignment ${i+1}`, (a.assigneeBag||[]).map(x=>x.assigneeNameText).join("; ")]) },
  ] : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 18, animation: "tabSlide 0.3s ease" }}>
      <Panel>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.indigo, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Step 01 — Upload</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Patent JSON File</div>
        <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16, lineHeight: 1.6 }}>Upload a USPTO patent JSON export. Validates, previews, and builds a two-sheet Excel workbook — all in browser.</div>
        {!file ? <DropZone onFile={handleFile} accept=".json" icon="📋" title="Drop JSON file here" hint="or click to browse · .json only" hasFile={false} isDragging={isDragging} setIsDragging={setIsDragging} />
          : <FileChip file={file} onClear={reset} />}
        <ErrorBox msg={error} />
        <LogBox logs={logs} />
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {stage === "done"
            ? <><Badge type="success">✓ Workbook downloaded</Badge><RippleBtn variant="secondary" onClick={reset}>← Convert another</RippleBtn></>
            : <RippleBtn onClick={convert} disabled={stage !== "ready"}>{stage === "converting" ? "Converting…" : "Convert to Excel"}</RippleBtn>}
          {stage === "ready" && <><Tag>Sheet 1 — Summary</Tag><Tag>Sheet 2 — History</Tag></>}
        </div>
      </Panel>

      <Panel>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.indigo, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Step 02 — Preview</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>Extracted Summary</div>
        {sections.length > 0 ? sections.map(sec => (
          <div key={sec.key} style={{ marginBottom: 6, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setExpanded(e => ({ ...e, [sec.key]: !e[sec.key] }))} style={{
              width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "9px 12px", background: expanded[sec.key] ? C.indigoDim : C.surface,
              border: "none", cursor: "pointer", color: expanded[sec.key] ? C.indigoHover : C.textSub,
              fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.04em", transition: "all 0.2s",
            }}>
              <span>{sec.label}</span>
              <span style={{ transition: "transform 0.2s", transform: expanded[sec.key] ? "rotate(180deg)" : "none" }}>▾</span>
            </button>
            {expanded[sec.key] && sec.rows.length > 0 && (
              <div style={{ animation: "fadeUp 0.2s ease" }}>
                {sec.rows.map(([k, v], i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "7px 12px", background: i % 2 === 0 ? C.surface : "transparent", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.textSub, width: 120, flexShrink: 0, paddingTop: 2 }}>{k}</div>
                    <div style={{ fontSize: 12, color: C.text, flex: 1, wordBreak: "break-word" }}>{v || "—"}</div>
                  </div>
                ))}
              </div>
            )}
            {expanded[sec.key] && sec.rows.length === 0 && <div style={{ padding: "8px 12px", fontSize: 12, color: C.textMuted, borderTop: `1px solid ${C.border}` }}>No data available.</div>}
          </div>
        )) : (
          <div style={{ color: C.textMuted, fontSize: 13, padding: "32px 0", textAlign: "center" }}>Upload a JSON file to see the preview.</div>
        )}
        {data && <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}><Tag color={C.teal} bg={C.tealDim}>Sheet 1 — Patent Summary</Tag><Tag color={C.teal} bg={C.tealDim}>Sheet 2 — Prosecution History</Tag></div>}
      </Panel>
    </div>
  );
}

// ── Tab 2: Excel → PDF ─────────────────────────────────────────────────────────
function PdfTab({ onDownload }) {
  const [excelFile, setExcelFile] = useState(null);
  const [folderHandle, setFolderHandle] = useState(null);
  const [folderStatus, setFolderStatus] = useState("none");
  const [stage, setStage] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState("all");
  const addLog = (text, type = "ok") => setLogs(l => [...l, { text, type }]);

  const handleExcel = useCallback(f => {
    setError(null);
    const ext = f.name.toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls") && !ext.endsWith(".csv")) { setError("Please upload .xlsx, .xls, or .csv"); return; }
    setExcelFile(f);
  }, []);

  const chooseFolder = async () => {
    if (!supportsFS) return;
    try {
      setError(null);
      const handle = await window.showDirectoryPicker({ mode: "readwrite", startIn: "downloads" });
      let perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") { setError("Write permission denied."); setFolderStatus("error"); return; }
      const th = await handle.getFileHandle(".write_test", { create: true });
      const w = await th.createWritable(); await w.write("ok"); await w.close();
      try { await handle.removeEntry(".write_test"); } catch {}
      setFolderHandle(handle); setFolderStatus("ready");
    } catch (e) { if (e.name !== "AbortError") { setError(e.message); setFolderStatus("error"); } }
  };

  const canDownload = excelFile && (folderHandle || !supportsFS) && stage !== "running";

  const startDownload = async () => {
    if (!excelFile) return;
    setStage("running"); setLogs([]); setResults([]); setProgress(0); setError(null); setFilter("all");
    try {
      const items = await readUrlsFromExcel(excelFile);
      if (!items.length) { setError('No valid URLs found. Check "Url" column.'); setStage("error"); return; }
      addLog(`Found ${items.length} URL(s)`, "info");
      if (supportsFS && folderHandle) {
        const perm = await folderHandle.queryPermission({ mode: "readwrite" });
        if (perm !== "granted") await folderHandle.requestPermission({ mode: "readwrite" });
        addLog(`Target folder: ${folderHandle.name}`, "info");
      }
      const res = new Array(items.length);
      const seen = new Set();
      const jobs = [];
      let completed = 0;
      let savedCount = 0;
      let saveQueue = Promise.resolve();

      items.forEach((item, index) => {
        if (seen.has(item.url)) {
          res[index] = { ...item, status: "skipped", reason: "Duplicate URL" };
          completed++;
          addLog(`Skipped duplicate: ${item.filename}`, "info");
        } else {
          seen.add(item.url);
          jobs.push({ ...item, index });
        }
      });

      // Browser downloads need a user gesture for each file, so keep that fallback sequential.
      // Chrome/Edge folder saving can safely fetch four PDFs at the same time.
      const concurrency = supportsFS && folderHandle ? Math.min(4, jobs.length) : 1;
      addLog(`Downloading with ${concurrency} concurrent connection${concurrency === 1 ? "" : "s"}`, "info");

      const publish = () => {
        completed++;
        setProgress(Math.round((completed / items.length) * 100));
        setResults(res.filter(Boolean));
      };

      let nextJob = 0;
      const worker = async () => {
        while (nextJob < jobs.length) {
          const job = jobs[nextJob++];
          const { url, filename, actionDate, index } = job;
          addLog(`[${index + 1}/${items.length}] ${url}`, "info");
          try {
            const { blob, filename: fn } = await downloadOnePdf(url, filename, actionDate);
            if (supportsFS && folderHandle) {
              // Serialize writes so duplicate file names are resolved safely.
              const save = saveQueue.then(() => saveToFolder(blob, fn, folderHandle));
              saveQueue = save.catch(() => {});
              const saved = await save;
              res[index] = { url, filename: saved, status: "saved" }; savedCount++;
              addLog(`Saved: ${saved}`, "ok");
            } else {
              triggerDownload(blob, fn);
              res[index] = { url, filename: fn, status: "downloaded" }; savedCount++;
              addLog(`Downloaded: ${fn}`, "ok");
            }
          } catch (err) {
            res[index] = { url, filename, status: "failed", reason: err.message };
            addLog(`Failed: ${err.message}`, "err");
          }
          publish();
        }
      };

      await Promise.all(Array.from({ length: concurrency }, worker));
      setProgress(100); setResults(res.filter(Boolean)); setStage("done");
      onDownload(savedCount);
    } catch (err) { setError(err.message); setStage("error"); }
  };

  const counts = { all: results.length, saved: results.filter(r => r.status === "saved" || r.status === "downloaded").length, failed: results.filter(r => r.status === "failed").length, skipped: results.filter(r => r.status === "skipped").length };
  const filtered = filter === "all" ? results : results.filter(r => filter === "saved" ? (r.status === "saved" || r.status === "downloaded") : r.status === filter);
  const typeMap = { saved: "success", downloaded: "success", skipped: "warning", failed: "danger" };
  const labelMap = { saved: `→ ${folderHandle?.name || "folder"}`, downloaded: "→ Downloads", skipped: "duplicate" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 18, animation: "tabSlide 0.3s ease" }}>
      <Panel>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.indigo, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Step 01 — Configure</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Excel File + Folder</div>
        <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16, lineHeight: 1.6 }}>
          Upload Excel with <code style={{ background: C.border, padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>Url</code> and <code style={{ background: C.border, padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>Action Date</code> columns.
        </div>
        {!excelFile ? <DropZone onFile={handleExcel} accept=".xlsx,.xls,.csv" icon="📊" title="Drop Excel file here" hint="or click to browse · .xlsx / .xls / .csv" hasFile={false} isDragging={isDragging} setIsDragging={setIsDragging} />
          : <FileChip file={excelFile} onClear={() => { setExcelFile(null); setResults([]); setStage("idle"); }} />}

        <div style={{ height: 1, background: C.border, margin: "18px 0" }} />

        <div style={{ background: C.surface, border: `1px solid ${folderStatus === "ready" ? C.teal + "66" : C.border}`, borderRadius: 10, overflow: "hidden", transition: "border-color 0.3s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 22, animation: folderStatus === "ready" ? "float 2s ease-in-out infinite" : "none" }}>📁</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {folderHandle ? folderHandle.name : supportsFS ? "No folder selected" : "Folder selection not supported"}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                {folderHandle ? `PDFs → "${folderHandle.name}"` : supportsFS ? "Choose a folder to save PDFs" : "PDFs → Downloads folder"}
              </div>
            </div>
            {folderStatus === "ready" && <Badge type="success">✓ Ready</Badge>}
            {folderStatus === "none"  && <Badge type="muted">Not set</Badge>}
            {folderStatus === "error" && <Badge type="danger">Error</Badge>}
          </div>
          {supportsFS && (
            <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
              <RippleBtn variant="secondary" onClick={chooseFolder} style={{ fontSize: 11, padding: "8px 14px" }}>Choose Folder</RippleBtn>
            </div>
          )}
        </div>

        {!supportsFS && <div style={{ marginTop: 10, padding: "10px 14px", background: C.warningDim, borderLeft: `3px solid ${C.warning}`, borderRadius: "0 8px 8px 0", fontSize: 12, color: C.warning }}>⚠️ Use Chrome or Edge for folder-based saving.</div>}
        <ErrorBox msg={error} />
        <LogBox logs={logs} />
        {stage === "running" && <ProgressBar pct={progress} label="Downloading PDFs" />}

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <RippleBtn onClick={startDownload} disabled={!canDownload}>
            {stage === "running" ? `Downloading… ${progress}%` : "Start Download"}
          </RippleBtn>
          {stage === "done" && <Badge type="success">✓ {counts.saved} saved · {counts.skipped} skipped · {counts.failed} failed</Badge>}
        </div>
      </Panel>

      <Panel>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.indigo, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Step 02 — Results</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>Download Summary</div>

        {results.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[["all", "All", counts.all], ["saved", "Saved", counts.saved], ["failed", "Failed", counts.failed], ["skipped", "Skipped", counts.skipped]].map(([key, label, count]) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding: "5px 12px", borderRadius: 999, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                background: filter === key ? C.indigo : C.surface, color: filter === key ? "#fff" : C.textSub,
                border: `1px solid ${filter === key ? C.indigo : C.border}`, cursor: "pointer", transition: "all 0.15s",
              }}>{label} {count > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>{count}</span>}</button>
            ))}
          </div>
        )}

        {filtered.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto" }}>
            {filtered.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, animation: "fadeUp 0.2s ease", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.borderHover}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <Badge type={typeMap[r.status]}>{r.status.toUpperCase()}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.filename}</div>
                  <div style={{ color: r.status === "failed" ? C.danger : C.textMuted, fontSize: 11, marginTop: 2, wordBreak: "break-word" }}>{r.reason || labelMap[r.status] || r.status}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: C.textMuted, fontSize: 13, padding: "32px 0", textAlign: "center" }}>
            {results.length > 0 ? `No ${filter} results.` : "Results will appear here after download starts."}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
const TYPING_WORDS = ["patent records", "prosecution histories", "PDF batches", "USPTO exports", "invention data"];
const TABS = [{ id: "json", label: "📄 Patent JSON → Excel" }, { id: "pdf", label: "📥 Excel → PDF Download" }];

export default function App() {
  const [activeTab, setActiveTab] = useState("json");
  const [stats, setStats] = useState({ converted: 0, pdfsDownloaded: 0, sessions: 0 });
  const [showConfetti, setShowConfetti] = useState(false);
  const typedWord = useTyping(TYPING_WORDS);
  const prevTab = useRef("json");

  const handleConvert = useCallback(() => {
    setStats(s => ({ ...s, converted: s.converted + 1, sessions: s.sessions + 1 }));
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 2500);
  }, []);

  const handleDownload = useCallback((count) => {
    setStats(s => ({ ...s, pdfsDownloaded: s.pdfsDownloaded + count }));
    if (count > 0) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2500); }
  }, []);

  const handleTabSwitch = (id) => { prevTab.current = activeTab; setActiveTab(id); };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{GLOBAL_CSS}</style>
      <Confetti active={showConfetti} />

      {/* Topbar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "13px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${C.indigo}, ${C.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "#fff", flexShrink: 0, boxShadow: `0 0 14px ${C.indigo}44` }}>PS</div>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, color: C.text }}>Patent + PDF Suite</div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>JSON → Excel · Excel → PDF</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BackendStatus />
          <span style={{ background: C.indigoDim, color: C.indigoHover, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", padding: "3px 9px", borderRadius: 4, fontWeight: 600 }}>v2.0</span>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 24px 80px" }}>

        {/* Hero */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.indigo, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 16, height: 1, background: C.indigo, display: "inline-block" }} /> Patent data tools
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, color: C.text, letterSpacing: "-0.025em", maxWidth: 640, marginBottom: 10 }}>
            Convert{" "}
            <span style={{ color: C.indigoHover, borderBottom: `2px solid ${C.indigo}`, paddingBottom: 2 }}>
              {typedWord}<span style={{ animation: "blink 1s step-end infinite", color: C.indigo }}>|</span>
            </span>
            <br />into structured outputs.
          </h1>
          <p style={{ fontSize: 14, color: C.textSub, maxWidth: 520, lineHeight: 1.7, marginBottom: 28 }}>
            USPTO patent JSON → formatted Excel workbook. Excel URL list → batch PDF downloads. Everything runs in your browser, PDFs via local backend.
          </p>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
            <StatCard label="Patents Converted" value={stats.converted} icon="📄" color={C.indigo} animate />
            <StatCard label="PDFs Downloaded" value={stats.pdfsDownloaded} icon="📥" color={C.teal} animate />
            <StatCard label="Sessions" value={stats.sessions} icon="⚡" color={C.success} animate />
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => handleTabSwitch(t.id)} style={{
              padding: "11px 20px", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.04em",
              background: activeTab === t.id ? C.indigoDim : "transparent",
              color: activeTab === t.id ? C.indigoHover : C.textSub,
              border: "none", borderBottom: `2px solid ${activeTab === t.id ? C.indigo : "transparent"}`,
              cursor: "pointer", transition: "all 0.2s", fontWeight: activeTab === t.id ? 700 : 400,
              marginBottom: -1,
            }}
            onMouseEnter={e => { if (activeTab !== t.id) e.currentTarget.style.color = C.text; }}
            onMouseLeave={e => { if (activeTab !== t.id) e.currentTarget.style.color = C.textSub; }}
            >{t.label}</button>
          ))}
        </div>

        {activeTab === "json" && <JsonTab onConvert={handleConvert} />}
        {activeTab === "pdf"  && <PdfTab onDownload={handleDownload} />}
      </div>

      <footer style={{ textAlign: "center", padding: "20px 28px", borderTop: `1px solid ${C.border}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.textMuted, letterSpacing: "0.06em" }}>
        RUNS IN YOUR BROWSER · PDF BACKEND AT :5000 · NO DATA STORED
      </footer>
    </div>
  );
}
