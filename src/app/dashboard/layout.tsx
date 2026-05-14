/* ── Sidebar – 208 px, fixed, no hover expansion ── */
.dl-sidebar {
  width: 208px; min-width: 208px;
  background: #0F172A;
  display: flex; flex-direction: column;
  position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
  transition: none; overflow: hidden;
  border-right: 1px solid #1E293B;
}
.dl-sidebar:hover { width: 208px; }

/* Logo – tighter padding so company name fits on one line */
.dl-sidebar-logo {
  display: flex; align-items: center; gap: 8px;
  padding: 18px 14px;           /* reduced padding */
  border-bottom: 1px solid #1E293B;
  min-height: 60px;            /* slightly less height */
}
.dl-sidebar-logo-img {
  width: 36px; height: 36px;    /* slightly smaller icon */
  border-radius: 10px;
  object-fit: contain;
  flex-shrink: 0;
}
.dl-sidebar-logo-name {
  color: white;
  font-size: 14px;              /* one size down */
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;          /* **** KEY: prevent wrapping **** */
}
.dl-sidebar-logo-sub {
  color: #64748B;
  font-size: 9px;
}

/* Section toggle – slightly smaller padding to save space */
.dl-section-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  background: none; border: none;
  color: #94A3B8;
  font-size: 12px; font-weight: 600;
  cursor: pointer; width: 100%; text-align: left;
  font-family: inherit; border-radius: 8px;
  transition: all 0.2s;
}
.dl-section-btn:hover { background: rgba(255,255,255,0.04); color: white; }
.dl-section-content { padding-left: 10px; margin-top: 4px; margin-bottom: 6px; }

/* Navigation */
.dl-sidebar-nav { flex: 1; padding: 10px 8px; overflow-y: auto; }

.dl-nav-section {
  padding: 10px 14px 4px; color: #64748B;
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
}
.dl-nav-group-label {
  padding: 4px 14px 2px; color: #475569;
  font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
}
.dl-nav-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  border-radius: 8px; color: #94A3B8;
  font-size: 13px; font-weight: 500;
  text-decoration: none; transition: all 0.15s; margin-bottom: 2px;
}
.dl-nav-item:hover { background: rgba(255,255,255,0.04); color: white; }

/* Active item – SOFT highlight, no bright blue */
.dl-nav-item.active {
  background: rgba(255,255,255,0.04);   /* subtle light overlay */
  color: white; font-weight: 600;
  border-left: 3px solid #334155;       /* dark slate instead of blue */
}
.dl-nav-icon { width: 20px; text-align: center; flex-shrink: 0; }
.dl-nav-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 6px 14px; }

/* User footer */
.dl-sidebar-user { padding: 14px; border-top: 1px solid #1E293B; display: flex; align-items: center; gap: 10px; }
.dl-sidebar-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: #1E293B; color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; flex-shrink: 0;
}
.dl-sidebar-email { color: #94A3B8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-sidebar-signout { color: #64748B; font-size: 10px; cursor: pointer; background: none; border: none; font-family: inherit; padding: 0; margin-top: 2px; }
.dl-sidebar-signout:hover { color: #EF4444; }