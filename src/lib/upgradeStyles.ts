// Styles for the Upgrade and Payment pages. Every class starts with "oup-" and is
// scoped under ".oup", so nothing here can affect any other page. Colours come only
// from the app's theme variables, so all three themes work.
export const UPGRADE_CSS = `
.oup{--oup-soft:color-mix(in srgb,var(--primary) 9%,var(--card));--oup-good:color-mix(in srgb,var(--success) 14%,var(--card));--oup-goodt:color-mix(in srgb,var(--success) 65%,var(--text));--oup-bad:color-mix(in srgb,var(--danger) 12%,var(--card));--oup-badt:color-mix(in srgb,var(--danger) 70%,var(--text));--oup-warn:color-mix(in srgb,var(--warning) 16%,var(--card));--oup-warnt:color-mix(in srgb,var(--warning) 55%,var(--text));
max-width:1180px;margin:0 auto;padding:18px 16px 24px;color:var(--text);font-family:inherit;font-size:14px;line-height:1.5;box-sizing:border-box}
.oup *{box-sizing:border-box}
.oup-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.oup-head img{width:44px;height:44px;border-radius:10px;object-fit:contain;flex:none}
.oup-head h1{font-size:22px;margin:0;line-height:1.2;color:var(--text)}
.oup-sub{color:var(--text-muted);margin:0}
.oup-ban{border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.oup-ban .g{flex:1;min-width:220px}
.oup-ban.bad{background:var(--oup-bad);color:var(--oup-badt)}
.oup-ban.warn{background:var(--oup-warn);color:var(--oup-warnt)}
.oup-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px;align-items:start}
@media(max-width:900px){.oup-grid{grid-template-columns:1fr}}
.oup-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:14px}
.oup-card h2{font-size:15px;margin:0 0 4px;color:var(--text)}
.oup-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px}
.oup-chips{display:flex;flex-wrap:wrap;gap:6px}
.oup-chip{background:var(--oup-good);color:var(--oup-goodt);border-radius:20px;padding:3px 10px;font-size:12px}
.oup-chip.core{background:var(--bg-soft);color:var(--text-muted);border:1px solid var(--border)}
.oup-per{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(max-width:520px){.oup-per{grid-template-columns:1fr}}
.oup-p{border:1.5px solid var(--border);border-radius:12px;padding:10px 12px;cursor:pointer;position:relative;background:var(--card);text-align:left;font:inherit;color:var(--text)}
.oup-p.on{border-color:var(--primary);background:var(--oup-soft)}
.oup-p .v{font-size:18px;font-weight:700}
.oup-p small{display:block;color:var(--text-muted)}
.oup-pill{position:absolute;top:-9px;right:8px;background:var(--primary);color:var(--primary-text);border-radius:20px;font-size:11px;padding:1px 8px;font-weight:600}
.oup-ok{color:var(--oup-goodt);font-weight:600}
.oup-add{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.oup-a{border:1.5px solid var(--border);border-radius:14px;padding:14px;background:var(--card);display:flex;flex-direction:column;gap:10px;position:relative;transition:border-color .15s,background .15s}
.oup-a.on{border-color:var(--primary);background:var(--oup-soft)}
.oup-a.have{background:var(--oup-good);border-color:transparent}
.oup-ai{display:flex;gap:10px;align-items:center}
.oup-ic{width:36px;height:36px;border-radius:10px;background:var(--oup-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;flex:none}
.oup-a.have .oup-ic{background:var(--card);color:var(--oup-goodt)}
.oup-a .n{font-weight:600;line-height:1.25}
.oup-a .d{color:var(--text-muted);font-size:12px;margin-top:1px}
.oup-tag{position:absolute;top:8px;right:8px;background:var(--oup-warn);color:var(--oup-warnt);border-radius:6px;padding:1px 6px;font-size:10px}
.oup-af{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}
.oup-ap{font-weight:700;font-size:15px}
.oup-ab{display:inline-flex;align-items:center;gap:4px;border-radius:9px;padding:6px 12px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;border:1.5px solid var(--primary);background:transparent;color:var(--primary)}
.oup-ab:hover{background:var(--oup-soft)}
.oup-ab.on{background:var(--primary);color:var(--primary-text)}
.oup-ab.have{border-color:transparent;background:transparent;color:var(--oup-goodt);cursor:default}
.oup-sum{position:sticky;top:12px}
.oup-line{display:flex;justify-content:space-between;gap:8px;padding:4px 0;color:var(--text-muted)}
.oup-line span:last-child{color:var(--text)}
.oup-tot{display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:8px;padding-top:10px;font-weight:700;font-size:18px}
.oup-cta{display:block;width:100%;margin-top:12px;background:var(--primary);color:var(--primary-text);border:0;border-radius:10px;padding:12px;font:inherit;font-weight:700;cursor:pointer;text-align:center;text-decoration:none}
.oup-cta:disabled{opacity:.55;cursor:not-allowed}
.oup-save{background:var(--oup-good);color:var(--oup-goodt);border-radius:8px;padding:6px 10px;margin-top:8px;font-size:12px}
.oup-note{font-size:12px;color:var(--text-muted);margin:8px 0 0}
.oup-cmp .r{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px}
.oup-cmp .nm{width:80px;flex:none}
.oup-cmp .tr{flex:1;background:var(--bg-soft);border-radius:6px;height:20px;overflow:hidden}
.oup-cmp .fl{height:100%;border-radius:6px;display:flex;align-items:center;padding-left:8px;color:#fff;white-space:nowrap;font-size:11px}
.oup-bar{position:sticky;bottom:0;z-index:3;background:var(--card);border-top:1px solid var(--border);padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 -16px}
.oup-bar .c{flex:1;min-width:150px;color:var(--text-muted);font-size:13px}
.oup-bar b{font-size:17px;color:var(--text)}
.oup-bar .oup-cta{width:auto;margin:0;padding:10px 22px}
.oup-step{display:flex;gap:8px;color:var(--text-muted);font-size:12px;margin-bottom:12px;flex-wrap:wrap}
.oup-step b{color:var(--text)}
.oup-ref{background:var(--oup-soft);color:var(--primary);border-radius:10px;padding:10px 12px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.oup-bk{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap}
.oup-bk:last-child{border:0}
.oup-link{background:none;border:0;color:var(--primary);cursor:pointer;font:inherit;padding:0 2px}
.oup-up{border:2px dashed var(--border);border-radius:12px;padding:18px;text-align:center;color:var(--text-muted);cursor:pointer;width:100%;background:transparent;font:inherit}
.oup-ct a{display:inline-block;border:1px solid var(--border);border-radius:8px;padding:8px 14px;margin:4px 6px 0 0;color:var(--text);text-decoration:none}
.oup-ct a.g{background:var(--primary);color:var(--primary-text);border-color:var(--primary)}
.oup-us{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.oup-us button{width:30px;height:30px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);cursor:pointer}
.oup-back{display:inline-block;border:1px solid var(--border);border-radius:8px;padding:6px 12px;margin-bottom:12px;color:var(--text);text-decoration:none;background:var(--card)}
.oup-btn{border:1px solid currentColor;border-radius:8px;padding:6px 12px;color:inherit;text-decoration:none;font-weight:600}
`