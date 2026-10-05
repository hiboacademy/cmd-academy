/* ============================================================
   engine/cmd-system.js — system information, processes, services
   hostname whoami systeminfo tasklist taskkill sc net shutdown
   ============================================================ */
(() => {
  const { def, lib, COMMANDS } = Shell;
  const { out, err, note, warn, msg, tokenize, showUsage, ask, num } = lib;

  def("hostname", [], { summary: "Prints the name of the current host.", usage: "Prints the name of the current host.\n\nhostname" }, (sh, rest, lines) => {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.hostname); return true; }
    if (rest.trim()) { err(lines, "sethostname: Use the Network Control Panel Applet to set hostname."); note(lines, msg("hostname_set")); return 1; }
    out(lines, sh.mode === "winre" ? "MININT-7Q2K1RB" : sh.net.hostname); return true;
  });

  def("whoami", [], {
    summary: "Displays the user name and group information of the current user.",
    usage: "WHOAMI [/USER] [/GROUPS] [/PRIV] [/ALL]\n\nDescription:\n    This utility can be used to get user name and group information\n    along with the respective security identifiers (SID) and privileges\n    for the user who is currently logged on.\n\n    /USER    Displays information on the current user along with the SID.\n    /GROUPS  Displays group membership for the current user.\n    /PRIV    Displays security privileges of the current user.",
  }, (sh, rest, lines) => {
    const a = rest.trim().toLowerCase();
    if (a === "/?") { showUsage(lines, COMMANDS.whoami); return true; }
    const user = sh.mode === "winre" ? "nt authority\\system" : "academy-pc\\student";
    if (a === "/user") {
      out(lines, ""); out(lines, "USER INFORMATION"); out(lines, "----------------"); out(lines, "");
      out(lines, "User Name          SID"); out(lines, "================== =============================================");
      out(lines, `${user.padEnd(18)} S-1-5-21-3623811015-3361044348-30300820-1001`); return true;
    }
    if (a === "/groups") {
      out(lines, ""); out(lines, "GROUP INFORMATION"); out(lines, "-----------------"); out(lines, "");
      out(lines, "Group Name                             Type             Attributes");
      out(lines, "====================================== ================ ===============================================");
      out(lines, "Everyone                               Well-known group Mandatory group, Enabled by default, Enabled group");
      out(lines, "BUILTIN\\Users                          Alias            Mandatory group, Enabled by default, Enabled group");
      out(lines, `BUILTIN\\Administrators                 Alias            ${sh.admin ? "Mandatory group, Enabled by default, Enabled group, Group owner" : "Group used for deny only"}`);
      out(lines, `Mandatory Label\\${sh.admin ? "High" : "Medium"} Mandatory Level       Label`);
      note(lines, msg(sh.admin ? "whoami_admin" : "whoami_user"));
      return true;
    }
    if (a === "/priv") {
      out(lines, ""); out(lines, "PRIVILEGES INFORMATION"); out(lines, "----------------------"); out(lines, "");
      out(lines, "Privilege Name                Description                          State"); out(lines, "============================= ==================================== ========");
      out(lines, "SeShutdownPrivilege           Shut down the system                 Disabled");
      out(lines, "SeChangeNotifyPrivilege       Bypass traverse checking             Enabled");
      if (sh.admin) { out(lines, "SeBackupPrivilege             Back up files and directories        Disabled"); out(lines, "SeDebugPrivilege              Debug programs                       Disabled"); }
      return true;
    }
    if (a && a !== "/all") { err(lines, `ERROR: Invalid argument/option - '${rest.trim()}'.`); out(lines, 'Type "WHOAMI /?" for usage.'); return 1; }
    out(lines, user);
    return true;
  });

  def("systeminfo", [], {
    summary: "Displays detailed configuration information about the computer.",
    usage: "SYSTEMINFO [/FO format]\n\nDescription:\n    This tool displays operating system configuration information for\n    a local or remote machine, including service pack levels.\n\n    /FO    format         Specifies the format in which the output\n                          is to be displayed.\n                          Valid values: \"TABLE\", \"LIST\", \"CSV\".",
  }, (sh, rest, lines) => {
    const a = rest.trim().toLowerCase();
    if (a === "/?") { showUsage(lines, COMMANDS.systeminfo); return true; }
    out(lines, "");
    if (/\/fo\s+csv/.test(a)) {
      const info = SysData.systemInfo();
      out(lines, info.map(([k]) => `"${k}"`).join(","));
      out(lines, info.map(([, v]) => `"${v.split("\n")[0]}"`).join(","));
      return true;
    }
    SysData.systemInfo().forEach(([k, v]) => out(lines, (k + ":").padEnd(27) + v));
    return true;
  });

  /* ---------------- TASKLIST ---------------- */
  function parseFilter(f) {
    const m = f.match(/^\s*(\w+)\s+(eq|ne|gt|lt|ge|le)\s+(.+?)\s*$/i);
    if (!m) return null;
    return { key: m[1].toLowerCase(), op: m[2].toLowerCase(), val: m[3] };
  }
  function procMatch(p, flt) {
    if (!flt) return true;
    let v;
    switch (flt.key) {
      case "imagename": v = p.name; break;
      case "pid": v = p.pid; break;
      case "memusage": v = p.mem; break;
      case "status": v = p.hung ? "NOT RESPONDING" : "RUNNING"; break;
      case "windowtitle": v = p.title || "N/A"; break;
      case "username": v = p.session === "Console" ? "ACADEMY-PC\\Student" : "NT AUTHORITY\\SYSTEM"; break;
      case "sessionname": v = p.session; break;
      case "services": v = p.svc || ""; break;
      default: return true;
    }
    if (typeof v === "number") {
      const n = parseInt(flt.val, 10);
      return { eq: v === n, ne: v !== n, gt: v > n, lt: v < n, ge: v >= n, le: v <= n }[flt.op];
    }
    const re = VFS.wildcardToRegex(flt.val.replace(/"/g, ""));
    const eq = re.test(String(v)) || String(v).toLowerCase().includes(flt.val.toLowerCase().replace(/\*$/, "")) && flt.key === "services";
    return flt.op === "ne" ? !eq : eq;
  }
  def("tasklist", [], {
    summary: "Displays all currently running tasks including services.",
    usage: "TASKLIST [/SVC | /V] [/FI filter] [/FO format] [/NH]\n\nDescription:\n    This tool displays a list of currently running processes on\n    either a local or remote machine.\n\n    /SVC                   Displays services hosted in each process.\n    /V                     Displays verbose task information.\n    /FI    filter          Displays a set of tasks that match a\n                           given criteria specified by the filter.\n    /FO    format          Specifies the output format.\n                           Valid values: \"TABLE\", \"LIST\", \"CSV\".\n    /NH                    Specifies that the \"Column Header\" should\n                           not be displayed in the output.\n\nFilters:\n    IMAGENAME     eq, ne         Image name\n    PID           eq, ne, gt, lt PID value\n    MEMUSAGE      eq, ne, gt, lt Memory usage in KB\n    STATUS        eq, ne         RUNNING | NOT RESPONDING\n    WINDOWTITLE   eq, ne         Window title\n\nExamples:\n    TASKLIST /FI \"IMAGENAME eq chrome.exe\"\n    TASKLIST /FI \"MEMUSAGE gt 100000\"\n    TASKLIST /SVC",
  }, (sh, rest, lines, rec) => {
    const toks = tokenize(rest);
    let svc = false, verbose = false, fo = "table", nh = false;
    const filters = [];
    for (let i = 0; i < toks.length; i++) {
      const v = toks[i].v.toLowerCase();
      if (v === "/?") { showUsage(lines, COMMANDS.tasklist); return true; }
      if (v === "/svc") svc = true;
      else if (v === "/v") verbose = true;
      else if (v === "/nh") nh = true;
      else if (v === "/fo") fo = (toks[++i] ? toks[i].v : "table").toLowerCase();
      else if (v === "/fi") {
        const f = toks[++i] ? parseFilter(toks[i].v) : null;
        if (!f) { err(lines, "ERROR: The search filter cannot be recognized."); note(lines, msg("tasklist_filter")); return 1; }
        filters.push(f);
      } else { err(lines, `ERROR: Invalid argument/option - '${toks[i].v}'.`); out(lines, 'Type "TASKLIST /?" for usage.'); return 1; }
    }
    rec.switches = toks.filter((t) => t.v.startsWith("/")).map((t) => t.v.toLowerCase());
    const list = sh.procs.filter((p) => filters.every((f) => procMatch(p, f)));
    if (!list.length) { out(lines, "INFO: No tasks are running which match the specified criteria."); return true; }
    if (fo === "csv") {
      if (!nh) out(lines, '"Image Name","PID","Session Name","Session#","Mem Usage"');
      list.forEach((p) => out(lines, `"${p.name}","${p.pid}","${p.session}","${p.session === "Console" ? 1 : 0}","${num(p.mem)} K"`));
      return true;
    }
    if (fo === "list") {
      list.forEach((p) => { out(lines, ""); out(lines, `Image Name:   ${p.name}`); out(lines, `PID:          ${p.pid}`); out(lines, `Session Name: ${p.session}`); out(lines, `Session#:     ${p.session === "Console" ? 1 : 0}`); out(lines, `Mem Usage:    ${num(p.mem)} K`); });
      return true;
    }
    out(lines, "");
    if (svc) {
      if (!nh) { out(lines, "Image Name                     PID Services"); out(lines, "========================= ======== ============================================"); }
      list.forEach((p) => out(lines, `${p.name.slice(0, 25).padEnd(25)} ${String(p.pid).padStart(8)} ${p.svc || "N/A"}`));
      return true;
    }
    if (verbose) {
      if (!nh) { out(lines, "Image Name                     PID Session Name        Session#    Mem Usage Status          Window Title"); out(lines, "========================= ======== ================ =========== ============ =============== ======================"); }
      list.forEach((p) => out(lines, `${p.name.slice(0, 25).padEnd(25)} ${String(p.pid).padStart(8)} ${p.session.padEnd(16)} ${String(p.session === "Console" ? 1 : 0).padStart(11)} ${(num(p.mem) + " K").padStart(12)} ${(p.hung ? "Not Responding" : "Running").padEnd(15)} ${p.title || "N/A"}`));
      return true;
    }
    if (!nh) { out(lines, "Image Name                     PID Session Name        Session#    Mem Usage"); out(lines, "========================= ======== ================ =========== ============"); }
    list.forEach((p) => out(lines, `${p.name.slice(0, 25).padEnd(25)} ${String(p.pid).padStart(8)} ${p.session.padEnd(16)} ${String(p.session === "Console" ? 1 : 0).padStart(11)} ${(num(p.mem) + " K").padStart(12)}`));
    return true;
  });

  /* ---------------- TASKKILL ---------------- */
  def("taskkill", [], {
    summary: "Kill or stop a running process or application.",
    usage: "TASKKILL [/FI filter] [/PID processid | /IM imagename] [/T] [/F]\n\nDescription:\n    This tool is used to terminate tasks by process id (PID) or image name.\n\n    /FI   filter           Applies a filter to select a set of tasks.\n    /PID  processid        Specifies the PID of the process to be terminated.\n                           Use TaskList to get the PID.\n    /IM   imagename        Specifies the image name of the process\n                           to be terminated. Wildcard '*' can be used.\n    /T                     Terminates the specified process and any\n                           child processes which were started by it.\n    /F                     Specifies to forcefully terminate the process(es).\n\nExamples:\n    TASKKILL /IM notepad.exe\n    TASKKILL /PID 1230 /PID 1241 /T\n    TASKKILL /F /IM chrome.exe",
    danger: true,
  }, (sh, rest, lines, rec) => {
    const toks = tokenize(rest);
    const pids = [], ims = [], filters = [];
    let F = false;
    for (let i = 0; i < toks.length; i++) {
      const v = toks[i].v.toLowerCase();
      if (v === "/?") { showUsage(lines, COMMANDS.taskkill); return true; }
      if (v === "/f") F = true;
      else if (v === "/t") continue;
      else if (v === "/pid") { const n = toks[++i]; if (!n || !/^\d+$/.test(n.v)) { err(lines, "ERROR: Invalid syntax. Value expected for '/pid'."); return 1; } pids.push(+n.v); }
      else if (v === "/im") { const n = toks[++i]; if (!n) { err(lines, "ERROR: Invalid syntax. Value expected for '/im'."); return 1; } ims.push(n.v); }
      else if (v === "/fi") { const f = toks[++i] ? parseFilter(toks[i].v) : null; if (f) filters.push(f); }
      else { err(lines, `ERROR: Invalid argument/option - '${toks[i].v}'.`); out(lines, 'Type "TASKKILL /?" for usage.'); return 1; }
    }
    rec.switches = toks.filter((t) => t.v.startsWith("/")).map((t) => t.v.toLowerCase());
    rec.args = ims.concat(pids.map(String));
    if (!pids.length && !ims.length && !filters.length) { err(lines, "ERROR: Invalid syntax. Neither /FI nor /PID nor /IM were specified."); note(lines, msg("taskkill_need")); return 1; }
    let ok = true, killed = 0;
    const killOne = (p) => {
      if (p.critical) { err(lines, `ERROR: The process with PID ${p.pid} could not be terminated.`); err(lines, "Reason: This is critical system process. Taskkill cannot end this process."); note(lines, msg("taskkill_critical")); ok = false; return; }
      if (p.session === "Services" && !sh.admin) { err(lines, `ERROR: The process "${p.name}" with PID ${p.pid} could not be terminated.`); err(lines, "Reason: Access is denied."); note(lines, msg("need_admin", { cmd: "taskkill" })); ok = false; return; }
      if (p.self) { warn(lines, msg("taskkill_self")); }
      if (p.hung && !F) { err(lines, `ERROR: The process "${p.name}" with PID ${p.pid} could not be terminated.`); err(lines, "Reason: This process can only be terminated forcefully (with /F option)."); note(lines, msg("taskkill_force")); ok = false; return; }
      sh.procs = sh.procs.filter((x) => x !== p);
      killed++;
      out(lines, F || p.self ? `SUCCESS: The process "${p.name}" with PID ${p.pid} has been terminated.` : `SUCCESS: Sent termination signal to the process "${p.name}" with PID ${p.pid}.`);
      if (p.svc && p.svc !== "N/A") sh.services.forEach((s) => { if (p.svc.split(/,\s*/).includes(s.name)) { s.state = "STOPPED"; s.pid = 0; } });
    };
    pids.forEach((pid) => {
      const p = sh.procs.find((x) => x.pid === pid);
      if (!p) { err(lines, `ERROR: The process "${pid}" not found.`); ok = false; return; }
      killOne(p);
    });
    ims.forEach((im) => {
      const re = VFS.wildcardToRegex(im);
      const list = sh.procs.filter((x) => re.test(x.name) && filters.every((f) => procMatch(x, f)));
      if (!list.length) { err(lines, `ERROR: The process "${im}" not found.`); note(lines, /\.exe$/i.test(im) ? msg("taskkill_notfound") : msg("taskkill_ext")); ok = false; return; }
      list.forEach(killOne);
    });
    if (!ims.length && !pids.length) sh.procs.filter((x) => filters.every((f) => procMatch(x, f))).forEach(killOne);
    rec.killed = killed;
    return ok ? true : 128;
  });

  /* ---------------- SC ---------------- */
  function scState(s) {
    const st = { RUNNING: "4  RUNNING", STOPPED: "1  STOPPED", START_PENDING: "2  START_PENDING", STOP_PENDING: "3  STOP_PENDING" }[s.state];
    return st;
  }
  function scQuery(lines, s) {
    out(lines, "");
    out(lines, `SERVICE_NAME: ${s.name}`);
    out(lines, `        TYPE               : ${s.name === "Spooler" ? "110  WIN32_OWN_PROCESS  (interactive)" : "30  WIN32"}`);
    out(lines, `        STATE              : ${scState(s)}`);
    if (s.state === "RUNNING") out(lines, "                                (STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN)");
    else out(lines, "                                (NOT_STOPPABLE, NOT_PAUSABLE, IGNORES_SHUTDOWN)");
    out(lines, `        WIN32_EXIT_CODE    : ${s.state === "RUNNING" ? "0  (0x0)" : "1077  (0x435)"}`);
    out(lines, "        SERVICE_EXIT_CODE  : 0  (0x0)");
    out(lines, "        CHECKPOINT         : 0x0");
    out(lines, "        WAIT_HINT          : 0x0");
  }
  const findSvc = (sh, n) => sh.services.find((s) => s.name.toLowerCase() === String(n).toLowerCase() || s.display.toLowerCase() === String(n).toLowerCase().replace(/"/g, ""));

  def("sc", [], {
    summary: "Communicates with the Service Controller and installed services.",
    usage: "DESCRIPTION:\n        SC is a command line program used for communicating with the\n        Service Control Manager and services.\nUSAGE:\n        sc <server> [command] [service name] <option1> <option2>...\n\n        Commands:\n          query-----------Queries the status for a service, or\n                          enumerates the status for types of services.\n          qc--------------Queries the configuration information for a service.\n          start-----------Starts a service.\n          stop------------Sends a STOP request to a service.\n\nExamples:\n        sc query\n        sc query Spooler\n        sc stop Spooler",
    admin: (rest) => /^\s*(start|stop|config|delete|create)\b/i.test(rest) ? true : false,
    adminError: "[SC] OpenService FAILED 5:\n\nAccess is denied.",
  }, (sh, rest, lines, rec) => {
    const toks = tokenize(rest).map((t) => t.v);
    const cmd = (toks[0] || "").toLowerCase();
    rec.args = toks;
    if (!cmd || cmd === "/?" || cmd === "help") { showUsage(lines, COMMANDS.sc); return true; }
    if (cmd === "query" || cmd === "queryex") {
      if (toks[1] && !/=/.test(toks[1])) {
        const s = findSvc(sh, toks[1]);
        if (!s) { out(lines, `[SC] EnumQueryServicesStatus:OpenService FAILED 1060:`); out(lines, ""); out(lines, "The specified service does not exist as an installed service."); out(lines, ""); note(lines, msg("sc_name")); return 1060; }
        scQuery(lines, s);
        return true;
      }
      const stateAll = toks.some((t) => /^state=/i.test(t)) && toks.some((t) => /^all$/i.test(t));
      sh.services.filter((s) => stateAll || s.state === "RUNNING").forEach((s) => scQuery(lines, s));
      return true;
    }
    if (cmd === "qc") {
      const s = findSvc(sh, toks[1]);
      if (!s) { out(lines, "[SC] OpenService FAILED 1060:"); out(lines, ""); out(lines, "The specified service does not exist as an installed service."); return 1060; }
      out(lines, "[SC] QueryServiceConfig SUCCESS"); out(lines, ""); out(lines, `SERVICE_NAME: ${s.name}`);
      out(lines, `        START_TYPE         : ${s.state === "RUNNING" ? "2   AUTO_START" : "3   DEMAND_START"}`);
      out(lines, `        DISPLAY_NAME       : ${s.display}`);
      return true;
    }
    if (cmd === "start" || cmd === "stop") {
      const s = findSvc(sh, toks[1]);
      if (!s) { out(lines, "[SC] OpenService FAILED 1060:"); out(lines, ""); out(lines, "The specified service does not exist as an installed service."); return 1060; }
      if (cmd === "stop") {
        if (s.state !== "RUNNING") { out(lines, "[SC] ControlService FAILED 1062:"); out(lines, ""); out(lines, "The service has not been started."); return 1062; }
        s.state = "STOPPED"; s.pid = 0;
        out(lines, ""); out(lines, `SERVICE_NAME: ${s.name}`); out(lines, "        STATE              : 3  STOP_PENDING");
        if (s.name === "WinDefend") warn(lines, msg("svc_defender"));
        return true;
      }
      if (s.state === "RUNNING") { out(lines, "[SC] StartService FAILED 1056:"); out(lines, ""); out(lines, "An instance of the service is already running."); return 1056; }
      s.state = "RUNNING"; s.pid = 3000 + Math.floor(Math.random() * 4000);
      out(lines, ""); out(lines, `SERVICE_NAME: ${s.name}`); out(lines, "        STATE              : 2  START_PENDING"); out(lines, `        PID                : ${s.pid}`);
      return true;
    }
    err(lines, `[SC] ${toks[0]}: unknown command`); note(lines, msg("sc_cmds"));
    return 1;
  });

  /* ---------------- NET ---------------- */
  def("net", [], {
    summary: "Manages services, users and network resources (start, stop, user ...).",
    usage: "The syntax of this command is:\n\nNET\n    [ ACCOUNTS | COMPUTER | CONFIG | CONTINUE | FILE | GROUP | HELP |\n      HELPMSG | LOCALGROUP | PAUSE | SESSION | SHARE | START |\n      STATISTICS | STOP | TIME | USE | USER | VIEW ]",
    admin: (rest) => /^\s*(start|stop)\s+\S/i.test(rest) || /^\s*user\s+\S+\s+\S/i.test(rest) ? true : false,
    adminError: "System error 5 has occurred.\n\nAccess is denied.\n",
  }, (sh, rest, lines, rec) => {
    const toks = tokenize(rest).map((t) => t.v);
    const cmd = (toks[0] || "").toLowerCase();
    rec.args = toks;
    if (!cmd || cmd === "/?" || cmd === "help") { showUsage(lines, COMMANDS.net); return true; }
    if (cmd === "start" && !toks[1]) {
      out(lines, "These Windows services are started:"); out(lines, "");
      sh.services.filter((s) => s.state === "RUNNING").sort((a, b) => a.display.localeCompare(b.display)).forEach((s) => out(lines, "   " + s.display));
      out(lines, ""); out(lines, "The command completed successfully."); out(lines, "");
      return true;
    }
    if (cmd === "start" || cmd === "stop") {
      const s = findSvc(sh, toks.slice(1).join(" "));
      if (!s) { out(lines, "The service name is invalid."); out(lines, ""); out(lines, "More help is available by typing NET HELPMSG 2185."); note(lines, msg("sc_name")); return 2; }
      if (cmd === "stop") {
        if (s.state !== "RUNNING") { out(lines, `The ${s.display} service is not started.`); out(lines, ""); return 2; }
        s.state = "STOPPED"; s.pid = 0;
        out(lines, `The ${s.display} service is stopping.`); out(lines, `The ${s.display} service was stopped successfully.`); out(lines, "");
        return true;
      }
      if (s.state === "RUNNING") { out(lines, "The requested service has already been started."); out(lines, ""); out(lines, "More help is available by typing NET HELPMSG 2182."); return 2; }
      s.state = "RUNNING";
      out(lines, `The ${s.display} service is starting.`); out(lines, `The ${s.display} service was started successfully.`); out(lines, "");
      return true;
    }
    if (cmd === "user") {
      if (!toks[1]) {
        out(lines, ""); out(lines, "User accounts for \\\\ACADEMY-PC"); out(lines, "");
        out(lines, "-------------------------------------------------------------------------------");
        out(lines, "Administrator            DefaultAccount           Guest"); out(lines, "Student                  WDAGUtilityAccount");
        out(lines, "The command completed successfully."); out(lines, "");
        return true;
      }
      const u = toks[1].toLowerCase();
      if (!["student", "administrator", "guest"].includes(u)) { out(lines, "The user name could not be found."); out(lines, ""); out(lines, "More help is available by typing NET HELPMSG 2221."); return 2; }
      out(lines, `User name                    ${toks[1]}`);
      out(lines, `Account active               ${u === "student" ? "Yes" : "No"}`);
      out(lines, "Password last set            9/20/2026 9:20:11 AM");
      out(lines, `Local Group Memberships      ${u === "guest" ? "*Guests" : "*Administrators       *Users"}`);
      out(lines, "The command completed successfully.");
      return true;
    }
    if (cmd === "use" || cmd === "view" || cmd === "share") {
      if (cmd === "use") { out(lines, "New connections will be remembered."); out(lines, ""); out(lines, "There are no entries in the list."); out(lines, ""); }
      else if (cmd === "share") { out(lines, ""); out(lines, "Share name   Resource                        Remark"); out(lines, ""); out(lines, "-------------------------------------------------------------------------------"); out(lines, "C$           C:\\                             Default share"); out(lines, "IPC$                                         Remote IPC"); out(lines, "ADMIN$       C:\\Windows                      Remote Admin"); out(lines, "The command completed successfully."); }
      else { out(lines, "System error 6118 has occurred."); out(lines, ""); out(lines, "The list of servers for this workgroup is not currently available"); }
      return true;
    }
    out(lines, "The syntax of this command is:"); out(lines, ""); out(lines, "NET"); out(lines, "    [ ACCOUNTS | COMPUTER | CONFIG | CONTINUE | FILE | GROUP | HELP |"); out(lines, "      HELPMSG | LOCALGROUP | PAUSE | SESSION | SHARE | START |"); out(lines, "      STATISTICS | STOP | TIME | USE | USER | VIEW ]");
    return 1;
  });

  /* ---------------- SHUTDOWN ---------------- */
  def("shutdown", [], {
    summary: "Shut down, restart or log off the computer (simulated).",
    usage: "Usage: shutdown [/i | /l | /s | /r | /g | /a | /p | /h | /e | /o] [/f] [/t xxx]\n\n    No args    Display help. This is the same as typing /?.\n    /l         Log off. This cannot be used with /m or /d options.\n    /s         Shutdown the computer.\n    /r         Full shutdown and restart the computer.\n    /a         Abort a system shutdown.\n               This can only be used during the time-out period.\n    /p         Turn off the local computer with no time-out or warning.\n    /h         Hibernate the local computer.\n    /o         Go to the advanced boot options menu and restart the computer.\n               Must be used with /r.\n    /t xxx     Set the time-out period before shutdown to xxx seconds.\n               The valid range is 0-315360000 (10 years), with a default of 30.\n    /f         Force running applications to close without forewarning users.",
    danger: true,
  }, (sh, rest, lines, rec) => {
    // shutdown accepts both /s and -s
    const toks = tokenize(rest).map((t) => t.v.toLowerCase().replace(/^-(?=[a-z?])/, "/"));
    rec.switches = toks.filter((t) => t.startsWith("/"));
    if (!toks.length || toks.includes("/?")) { showUsage(lines, COMMANDS.shutdown); return true; }
    if (toks.includes("/a")) {
      if (!sh.shutdownPending) { err(lines, "Unable to abort the system shutdown because no shutdown was in progress.(1116)"); return 1116; }
      sh.shutdownPending = null; note(lines, msg("shutdown_abort")); return true;
    }
    const ti = toks.indexOf("/t");
    const secs = ti >= 0 ? parseInt(toks[ti + 1], 10) : 30;
    const what = toks.includes("/r") ? "restart" : toks.includes("/l") ? "logoff" : toks.includes("/h") ? "hibernate" : toks.includes("/s") || toks.includes("/p") ? "shutdown" : null;
    if (!what) { showUsage(lines, COMMANDS.shutdown); return 1; }
    if (what !== "logoff" && what !== "hibernate" && secs > 0) sh.shutdownPending = { what, secs };
    warn(lines, msg("shutdown_sim", { what: msg("shutdown_" + what), secs: isNaN(secs) ? 30 : secs }));
    return true;
  });
})();
