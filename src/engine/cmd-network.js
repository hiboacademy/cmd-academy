/* ============================================================
   engine/cmd-network.js — a simulated home network
   ipconfig ping tracert pathping nslookup netstat arp route getmac
   ============================================================ */
(() => {
  const { def, lib, COMMANDS } = Shell;
  const { out, err, note, warn, msg, tokenize, showUsage, ask } = lib;

  const isIP = (s) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) && s.split(".").every((x) => +x <= 255);
  function hash(s) { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

  /* resolve a name: {ip, name} | null */
  function resolveHost(sh, host) {
    const h = String(host).toLowerCase().replace(/\.$/, "");
    if (isIP(h)) return { ip: h, name: null };
    if (h === sh.net.hostname.toLowerCase() || h === "academy-pc") return { ip: "192.168.1.24", name: sh.net.hostname };
    const ip = sh.net.hosts[h];
    if (!ip) return null;
    if (!sh.net.dnsCache.includes(h)) sh.net.dnsCache.push(h);
    return { ip, name: h };
  }
  function reverseName(sh, ip) {
    const e = Object.entries(sh.net.hosts).find(([n, v]) => v === ip && !n.startsWith("www."));
    if (ip === "142.250.185.78") return "fra16s48-in-f14.1e100.net";
    return e ? e[0] : null;
  }
  /* how a host answers: "ok" | "timeout" | "unreachable" | "self" | "loop" */
  function reach(sh, ip) {
    if (/^127\./.test(ip)) return "loop";
    if (!sh.net.connected) return "nonet";
    if (ip === sh.net.wifi.ip) return "self";
    if (sh.net.silent.includes(ip)) return "timeout";
    if (/^192\.168\.1\./.test(ip)) return ["192.168.1.1", "192.168.1.50"].includes(ip) ? "lan" : "unreachable";
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) return "timeout";
    return "ok";
  }

  /* ---------------- IPCONFIG ---------------- */
  def("ipconfig", [], {
    summary: "Displays the IP network configuration (address, mask, gateway).",
    usage: "USAGE:\n    ipconfig [/allcompartments] [/? | /all |\n                                 /renew [adapter] | /release [adapter] |\n                                 /flushdns | /displaydns ]\n\nwhere\n    Options:\n       /?               Display this help message\n       /all             Display full configuration information.\n       /release         Release the IPv4 address for the specified adapter.\n       /renew           Renew the IPv4 address for the specified adapter.\n       /flushdns        Purges the DNS Resolver cache.\n       /displaydns      Display the contents of the DNS Resolver Cache.\n\nThe default is to display only the IP address, subnet mask and\ndefault gateway for each adapter bound to TCP/IP.",
  }, function* (sh, rest, lines, rec) {
    const a = rest.trim().toLowerCase().split(/\s+/)[0] || "";
    rec.switches = a ? [a] : [];
    if (a === "/?") { showUsage(lines, COMMANDS.ipconfig); return true; }
    const w = sh.net.wifi;
    if (a === "/flushdns") {
      out(lines, ""); out(lines, "Windows IP Configuration"); out(lines, "");
      out(lines, "Successfully flushed the DNS Resolver Cache."); sh.net.dnsCache = []; return true;
    }
    if (a === "/displaydns") {
      out(lines, ""); out(lines, "Windows IP Configuration"); out(lines, "");
      if (!sh.net.dnsCache.length) { note(lines, msg("dns_empty")); return true; }
      sh.net.dnsCache.forEach((h) => {
        out(lines, `    ${h}`); out(lines, "    ----------------------------------------");
        out(lines, `    Record Name . . . . . : ${h}`); out(lines, "    Record Type . . . . . : 1");
        out(lines, `    Time To Live  . . . . : ${200 + (hash(h) % 3000)}`); out(lines, "    Data Length . . . . . : 4");
        out(lines, "    Section . . . . . . . : Answer"); out(lines, `    A (Host) Record . . . : ${sh.net.hosts[h]}`); out(lines, "");
      });
      return true;
    }
    if (a === "/release" || a === "/renew") {
      out(lines, ""); out(lines, "Windows IP Configuration"); out(lines, "");
      if (a === "/release") {
        sh.net.connected = false;
        out(lines, "No operation can be performed on Ethernet while it has its media disconnected.");
      } else {
        yield { kind: "sleep", ms: 1200 };
        sh.net.connected = true;
        out(lines, "No operation can be performed on Ethernet while it has its media disconnected.");
      }
      printAdapters(sh, lines, false);
      note(lines, msg(a === "/release" ? "ipconfig_released" : "ipconfig_renewed"));
      return true;
    }
    if (a && a !== "/all") { err(lines, `Error: unrecognized or incomplete command line.`); out(lines, ""); out(lines, "USAGE:"); out(lines, "    ipconfig [/? | /all | /renew | /release | /flushdns | /displaydns ]"); return 1; }
    out(lines, "");
    out(lines, "Windows IP Configuration");
    out(lines, "");
    if (a === "/all") {
      out(lines, `   Host Name . . . . . . . . . . . . : ${sh.net.hostname}`);
      out(lines, "   Primary Dns Suffix  . . . . . . . : ");
      out(lines, "   Node Type . . . . . . . . . . . . : Hybrid");
      out(lines, "   IP Routing Enabled. . . . . . . . : No");
      out(lines, "   WINS Proxy Enabled. . . . . . . . : No");
      out(lines, "   DNS Suffix Search List. . . . . . : home");
    }
    printAdapters(sh, lines, a === "/all");
    return true;
  });

  function printAdapters(sh, lines, all) {
    const w = sh.net.wifi, e = sh.net.eth;
    out(lines, "");
    out(lines, "Ethernet adapter Ethernet:");
    out(lines, "");
    out(lines, "   Media State . . . . . . . . . . . : Media disconnected");
    out(lines, "   Connection-specific DNS Suffix  . : ");
    if (all) {
      out(lines, `   Description . . . . . . . . . . . : ${e.desc}`);
      out(lines, `   Physical Address. . . . . . . . . : ${e.mac}`);
      out(lines, "   DHCP Enabled. . . . . . . . . . . : Yes");
      out(lines, "   Autoconfiguration Enabled . . . . : Yes");
    }
    out(lines, "");
    out(lines, "Wireless LAN adapter Wi-Fi:");
    out(lines, "");
    out(lines, `   Connection-specific DNS Suffix  . : ${sh.net.connected ? "home" : ""}`);
    if (all) {
      out(lines, `   Description . . . . . . . . . . . : ${w.desc}`);
      out(lines, `   Physical Address. . . . . . . . . : ${w.mac}`);
      out(lines, "   DHCP Enabled. . . . . . . . . . . : Yes");
      out(lines, "   Autoconfiguration Enabled . . . . : Yes");
    }
    out(lines, `   Link-local IPv6 Address . . . . . : ${w.v6}${all ? "(Preferred) " : ""}`);
    if (sh.net.connected) {
      out(lines, `   IPv4 Address. . . . . . . . . . . : ${w.ip}${all ? "(Preferred) " : ""}`);
      out(lines, `   Subnet Mask . . . . . . . . . . . : ${w.mask}`);
      if (all) {
        out(lines, `   Lease Obtained. . . . . . . . . . : ${w.leaseObtained}`);
        out(lines, `   Lease Expires . . . . . . . . . . : ${w.leaseExpires}`);
      }
      out(lines, `   Default Gateway . . . . . . . . . : ${w.gw}`);
      if (all) {
        out(lines, `   DHCP Server . . . . . . . . . . . : ${w.dhcpServer}`);
        out(lines, `   DNS Servers . . . . . . . . . . . : ${w.dns[0]}`);
        w.dns.slice(1).forEach((d) => out(lines, `                                       ${d}`));
        out(lines, "   NetBIOS over Tcpip. . . . . . . . : Enabled");
      }
    } else {
      out(lines, "   Default Gateway . . . . . . . . . : ");
    }
  }

  /* ---------------- PING ---------------- */
  def("ping", [], {
    summary: "Tests whether another computer can be reached on the network.",
    usage: "Usage: ping [-t] [-a] [-n count] [-l size] [-w timeout] [-4] [-6] target_name\n\nOptions:\n    -t             Ping the specified host until stopped.\n                   To stop - type Control-C.\n    -a             Resolve addresses to hostnames.\n    -n count       Number of echo requests to send.\n    -l size        Send buffer size.\n    -w timeout     Timeout in milliseconds to wait for each reply.\n    -4             Force using IPv4.\n    -6             Force using IPv6.",
  }, function* (sh, rest, lines, rec) {
    const toks = tokenize(rest).map((t) => t.v);
    let count = 4, size = 32, forever = false, target = null, resolveA = false;
    for (let i = 0; i < toks.length; i++) {
      const v = toks[i].toLowerCase();
      if (v === "/?" || v === "-?") { showUsage(lines, COMMANDS.ping); return true; }
      if (v === "-t" || v === "/t") forever = true;
      else if (v === "-a" || v === "/a") resolveA = true;
      else if (v === "-4" || v === "-6") continue;
      else if (v === "-n" || v === "/n") { count = parseInt(toks[++i], 10); if (!(count > 0)) { err(lines, "Bad value for option -n, valid range is from 1 to 4294967295."); return 1; } }
      else if (v === "-l" || v === "/l") { size = parseInt(toks[++i], 10); if (!(size >= 0 && size <= 65500)) { err(lines, "Bad value for option -l, valid range is from 0 to 65500."); return 1; } }
      else if (v === "-w" || v === "/w" || v === "-i" || v === "/i") i++;
      else if (v.startsWith("-")) { err(lines, `Bad option ${toks[i]}.`); note(lines, msg("ping_option")); return 1; }
      else target = toks[i];
    }
    rec.args = target ? [target] : []; rec.switches = toks.filter((t) => t.startsWith("-"));
    if (!target) { showUsage(lines, COMMANDS.ping); err(lines, "IP address must be specified."); return 1; }
    const r = resolveHost(sh, target);
    if (!r) {
      out(lines, `Ping request could not find host ${target}. Please check the name and try again.`);
      note(lines, /\./.test(target) ? msg("ping_nohost") : msg("ping_nohost_dot", { t: target }));
      return 1;
    }
    let state = reach(sh, r.ip);
    if (state === "nonet" && !/^127\./.test(r.ip)) {
      if (r.name && !isIP(target)) { out(lines, `Ping request could not find host ${target}. Please check the name and try again.`); note(lines, msg("ping_nonet")); return 1; }
      out(lines, ""); out(lines, `Pinging ${r.ip} with ${size} bytes of data:`);
      for (let k = 0; k < count; k++) { out(lines, "PING: transmit failed. General failure. "); yield { kind: "sleep", ms: 250 }; }
      out(lines, ""); out(lines, `Ping statistics for ${r.ip}:`); out(lines, `    Packets: Sent = ${count}, Received = 0, Lost = ${count} (100% loss),`);
      note(lines, msg("ping_nonet")); return 1;
    }
    const shownName = resolveA && !r.name ? reverseName(sh, r.ip) : r.name && !isIP(target) ? r.name : null;
    out(lines, "");
    out(lines, `Pinging ${shownName ? `${shownName} [${r.ip}]` : r.ip} with ${size} bytes of data:`);
    const times = [];
    let recv = 0, sent = 0;
    const base = state === "loop" || state === "self" ? 0 : state === "lan" ? 2 : 10 + (hash(r.ip) % 25);
    const ttl = state === "loop" || state === "self" ? 128 : state === "lan" ? 64 : 117 - (hash(r.ip) % 10);
    const n = forever ? 200 : count;
    for (let k = 0; k < n; k++) {
      sent++;
      if (state === "timeout") out(lines, "Request timed out.");
      else if (state === "unreachable") { out(lines, `Reply from ${sh.net.wifi.ip}: Destination host unreachable.`); recv++; }
      else {
        const t = base + ((hash(r.ip + k) % 5) - 2);
        const tt = Math.max(0, t);
        times.push(tt);
        recv++;
        out(lines, `Reply from ${r.ip}: bytes=${size} ${tt < 1 ? "time<1ms" : "time=" + tt + "ms"} TTL=${ttl}`);
      }
      if (k < n - 1) {
        const a = yield { kind: "sleep", ms: state === "timeout" ? 900 : 450, interruptible: false };
        if (a === "^C") break;
      }
    }
    out(lines, "");
    out(lines, `Ping statistics for ${r.ip}:`);
    const lost = sent - recv;
    out(lines, `    Packets: Sent = ${sent}, Received = ${recv}, Lost = ${lost} (${Math.round((lost / sent) * 100)}% loss),`);
    if (times.length) {
      out(lines, "Approximate round trip times in milli-seconds:");
      const mn = Math.min(...times), mx = Math.max(...times), av = Math.round(times.reduce((s, x) => s + x, 0) / times.length);
      out(lines, `    Minimum = ${mn}ms, Maximum = ${mx}ms, Average = ${av}ms`);
    }
    if (state === "timeout") note(lines, msg("ping_timeout"));
    if (state === "unreachable") note(lines, msg("ping_unreachable"));
    rec.reply = state !== "timeout" && state !== "unreachable";
    return state === "timeout" ? 1 : 0;
  });

  /* ---------------- TRACERT ---------------- */
  def("tracert", [], {
    summary: "Shows the route (hops) packets take to reach another computer.",
    usage: "Usage: tracert [-d] [-h maximum_hops] [-w timeout] target_name\n\nOptions:\n    -d                 Do not resolve addresses to hostnames.\n    -h maximum_hops    Maximum number of hops to search for target.\n    -w timeout         Wait timeout milliseconds for each reply.",
  }, function* (sh, rest, lines, rec) {
    const toks = tokenize(rest).map((t) => t.v);
    let D = false, maxH = 30, target = null;
    for (let i = 0; i < toks.length; i++) {
      const v = toks[i].toLowerCase();
      if (v === "/?" || v === "-?") { showUsage(lines, COMMANDS.tracert); return true; }
      if (v === "-d") D = true;
      else if (v === "-h") maxH = parseInt(toks[++i], 10) || 30;
      else if (v === "-w") i++;
      else target = toks[i];
    }
    rec.args = target ? [target] : [];
    if (!target) { showUsage(lines, COMMANDS.tracert); return 1; }
    const r = resolveHost(sh, target);
    if (!r) { out(lines, `Unable to resolve target system name ${target}.`); note(lines, msg("ping_nohost")); return 1; }
    const st = reach(sh, r.ip);
    out(lines, "");
    out(lines, `Tracing route to ${r.name && !isIP(target) ? `${r.name} [${r.ip}]` : (reverseName(sh, r.ip) && !D ? `${reverseName(sh, r.ip)} [${r.ip}]` : r.ip)}`);
    out(lines, `over a maximum of ${maxH} hops:`);
    out(lines, "");
    const ms = (v) => (v < 1 ? "<1 ms" : `${v} ms`).padStart(5);
    if (st === "nonet") { out(lines, "Transmit error: code 1231."); note(lines, msg("ping_nonet")); return 1; }
    if (st === "loop" || st === "self") { out(lines, `  1    <1 ms    <1 ms    <1 ms  ${r.ip}`); out(lines, ""); out(lines, "Trace complete."); return true; }
    const hops = st === "lan" ? [] : sh.net.hops.slice();
    let k = 0;
    for (const hp of hops) {
      k++;
      if (k > maxH) break;
      if (hp.ip === "*") out(lines, `${String(k).padStart(3)}     *        *        *     Request timed out.`);
      else out(lines, `${String(k).padStart(3)}  ${hp.ms.map(ms).join("  ")}  ${hp.name && !D ? `${hp.name} [${hp.ip}]` : hp.ip}`);
      yield { kind: "sleep", ms: 350 };
    }
    if (st === "timeout") {
      for (let x = 0; x < 3 && k < maxH; x++) { k++; out(lines, `${String(k).padStart(3)}     *        *        *     Request timed out.`); yield { kind: "sleep", ms: 500 }; }
      note(lines, msg("tracert_timeout"));
      out(lines, ""); out(lines, "Trace complete."); return true;
    }
    if (k < maxH) {
      k++;
      const base = st === "lan" ? 1 : 15 + (hash(r.ip) % 10);
      const nm = !D && (reverseName(sh, r.ip) || r.name);
      out(lines, `${String(k).padStart(3)}  ${[base, base - 1, base + 1].map((v) => ms(Math.max(1, v))).join("  ")}  ${nm ? `${nm} [${r.ip}]` : r.ip}`);
    }
    out(lines, "");
    out(lines, "Trace complete.");
    return true;
  });

  def("pathping", [], {
    summary: "Combines ping and tracert, and shows packet loss for each hop.",
    usage: "Usage: pathping [-n] [-h maximum_hops] [-q num_queries] target_name\n\nOptions:\n    -n                 Do not resolve addresses to hostnames.\n    -h maximum_hops    Maximum number of hops to search for target.\n    -q num_queries     Number of queries per hop.",
  }, function* (sh, rest, lines, rec) {
    const toks = tokenize(rest).map((t) => t.v).filter((t) => !t.startsWith("-"));
    if (rest.trim() === "/?" || !toks.length) { showUsage(lines, COMMANDS.pathping); return !toks.length ? 1 : true; }
    const target = toks[toks.length - 1];
    rec.args = [target];
    const r = resolveHost(sh, target);
    if (!r) { out(lines, `Unable to resolve target system name ${target}.`); return 1; }
    if (reach(sh, r.ip) === "nonet") { out(lines, "Transmit error: code 1231."); return 1; }
    const hops = [{ ip: sh.net.wifi.ip, name: sh.net.hostname }].concat(sh.net.hops.filter((h) => h.ip !== "*"), [{ ip: r.ip, name: reverseName(sh, r.ip) || r.name }]);
    out(lines, ""); out(lines, `Tracing route to ${r.name ? `${r.name} [${r.ip}]` : r.ip}`); out(lines, "over a maximum of 30 hops:");
    hops.forEach((h, i) => out(lines, `${String(i).padStart(3)}  ${h.name ? `${h.name} [${h.ip}]` : h.ip}`));
    out(lines, ""); out(lines, `Computing statistics for ${hops.length * 25} seconds...`);
    yield { kind: "sleep", ms: 1500 };
    out(lines, "            Source to Here   This Node/Link");
    out(lines, "Hop  RTT    Lost/Sent = Pct  Lost/Sent = Pct  Address");
    hops.forEach((h, i) => {
      const lost = i === 2 ? 12 : 0;
      out(lines, `${String(i).padStart(3)}  ${i ? String(i * 4) + "ms" : "   "}`.padEnd(12) + `${i ? `${String(lost).padStart(4)}/ 100 = ${String(lost).padStart(2)}%` : "".padEnd(17)}   ${String(lost).padStart(4)}/ 100 = ${String(lost).padStart(2)}%  ${h.name ? `${h.name} [${h.ip}]` : h.ip}`);
    });
    out(lines, ""); out(lines, "Trace complete.");
    note(lines, msg("pathping_note"));
    return true;
  });

  /* ---------------- NSLOOKUP ---------------- */
  function lookup(sh, lines, name, server) {
    const srv = server ? (resolveHost(sh, server) || { ip: server }) : { ip: "192.168.1.1", name: "router.home" };
    const srvName = server ? (reverseName(sh, srv.ip) || "UnKnown") : "router.home";
    out(lines, `Server:  ${srvName}`);
    out(lines, `Address:  ${srv.ip}`);
    out(lines, "");
    if (!sh.net.connected) { out(lines, "*** Can't find server address for 'router.home': No response from server"); note(lines, msg("ping_nonet")); return 1; }
    if (isIP(name)) {
      const rn = reverseName(sh, name);
      if (!rn) { out(lines, `*** ${srvName} can't find ${name}: Non-existent domain`); return 1; }
      out(lines, `Name:    ${rn}`); out(lines, `Address:  ${name}`); out(lines, ""); return true;
    }
    const r = resolveHost(sh, name);
    if (!r || isIP(name)) { out(lines, `*** ${srvName} can't find ${name}: Non-existent domain`); note(lines, msg("nslookup_none")); return 1; }
    out(lines, "Non-authoritative answer:");
    out(lines, `Name:    ${name.toLowerCase()}`);
    if (/google/.test(name)) { out(lines, "Addresses:  2a00:1450:4001:82f::200e"); out(lines, `          ${r.ip}`); }
    else out(lines, `Address:  ${r.ip}`);
    out(lines, "");
    return true;
  }
  def("nslookup", [], {
    summary: "Asks a DNS server for the IP address of a name (and back).",
    usage: "Usage:\n   nslookup [-opt ...]             # interactive mode using default server\n   nslookup [-opt ...] host        # just look up 'host' using default server\n   nslookup [-opt ...] host server # just look up 'host' using 'server'",
  }, function* (sh, rest, lines, rec) {
    const toks = tokenize(rest).map((t) => t.v).filter((t) => !t.startsWith("-"));
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.nslookup); return true; }
    rec.args = toks;
    if (toks.length) return lookup(sh, lines, toks[0], toks[1]);
    out(lines, "Default Server:  router.home"); out(lines, "Address:  192.168.1.1"); out(lines, "");
    note(lines, msg("nslookup_interactive"));
    let server = null;
    for (let guard = 0; guard < 200; guard++) {
      const q = (yield* ask("> ", "line", { noStdin: false })).trim();
      if (!q) continue;
      if (/^(exit|quit)$/i.test(q)) break;
      const sm = q.match(/^server\s+(\S+)/i);
      if (sm) { server = sm[1]; out(lines, `Default Server:  ${reverseName(sh, server) || server}`); out(lines, `Address:  ${server}`); out(lines, ""); continue; }
      if (/^help$|^\?$/i.test(q)) { out(lines, "Commands:   (identifiers are shown in uppercase, [] means optional)"); out(lines, "NAME            - print info about the host/domain NAME using default server"); out(lines, "server NAME     - set default server to NAME"); out(lines, "exit            - exit the program"); continue; }
      lookup(sh, lines, q.split(/\s+/)[0], server);
    }
    return true;
  });

  /* ---------------- NETSTAT ---------------- */
  def("netstat", [], {
    summary: "Displays active network connections and listening ports.",
    usage: "Displays protocol statistics and current TCP/IP network connections.\n\nNETSTAT [-a] [-b] [-n] [-o] [-r]\n\n  -a            Displays all connections and listening ports.\n  -b            Displays the executable involved in creating each connection or\n                listening port. (requires Administrator)\n  -n            Displays addresses and port numbers in numerical form.\n  -o            Displays the owning process ID associated with each connection.\n  -r            Displays the routing table.",
  }, (sh, rest, lines, rec) => {
    const flags = rest.toLowerCase().match(/-[a-z]+/g) || [];
    const f = flags.join("").replace(/-/g, "");
    rec.switches = flags;
    if (rest.trim() === "/?" || rest.trim() === "-?") { showUsage(lines, COMMANDS.netstat); return true; }
    if (f.includes("r")) return COMMANDS.route.run(sh, " print", lines, rec);
    if (f.includes("b") && !sh.admin) { out(lines, "The requested operation requires elevation."); note(lines, msg("need_admin", { cmd: "netstat -b" })); return 1; }
    const A = f.includes("a"), N = f.includes("n"), O = f.includes("o"), B = f.includes("b");
    out(lines, ""); out(lines, "Active Connections"); out(lines, "");
    out(lines, `  Proto  Local Address          Foreign Address        State${O ? "           PID" : ""}`);
    const list = sh.net.conns.filter((c) => (A || (c.state && c.state !== "LISTENING")) && (sh.net.connected || /^0\.0\.0\.0/.test(c.local)));
    list.forEach((c) => {
      let local = c.local, remote = c.remote;
      if (!N) {
        local = local.replace(/^0\.0\.0\.0/, "0.0.0.0").replace(/^192\.168\.1\.24/, "ACADEMY-PC");
        if (c.rname) remote = c.rname;
        else remote = remote.replace(/^0\.0\.0\.0:0$/, "ACADEMY-PC:0");
      }
      out(lines, `  ${c.proto.padEnd(6)} ${local.padEnd(22)} ${remote.padEnd(22)} ${(c.state || "").padEnd(15)}${O ? " " + c.pid : ""}`.trimEnd());
      if (B) out(lines, c.exe ? ` [${c.exe}]` : " Can not obtain ownership information");
    });
    if (!list.length) note(lines, msg("netstat_none"));
    return true;
  });

  /* ---------------- ARP ---------------- */
  def("arp", [], {
    summary: "Shows the table that links IP addresses to MAC (physical) addresses.",
    usage: "Displays and modifies the IP-to-Physical address translation tables used by\naddress resolution protocol (ARP).\n\nARP -a [inet_addr]\nARP -d inet_addr\n\n  -a            Displays current ARP entries.\n  -d            Deletes the host specified by inet_addr. (requires Administrator)",
  }, (sh, rest, lines, rec) => {
    const toks = tokenize(rest).map((t) => t.v.toLowerCase());
    rec.switches = toks.filter((t) => t.startsWith("-"));
    if (!toks.length || toks[0] === "/?") { showUsage(lines, COMMANDS.arp); return toks.length ? true : 1; }
    if (toks[0] === "-d") {
      if (!sh.admin) { out(lines, "The ARP entry deletion failed: The requested operation requires elevation."); note(lines, msg("need_admin", { cmd: "arp -d" })); return 1; }
      sh.net.arp = sh.net.arp.filter((e) => e.type === "static" || (toks[1] && toks[1] !== "*" && e.ip !== toks[1]));
      return true;
    }
    if (toks[0] === "-a" || toks[0] === "-g") {
      out(lines, ""); out(lines, `Interface: ${sh.net.connected ? sh.net.wifi.ip : "169.254.12.7"} --- 0xe`);
      out(lines, "  Internet Address      Physical Address      Type");
      sh.net.arp.filter((e) => !toks[1] || e.ip === toks[1]).forEach((e) => out(lines, `  ${e.ip.padEnd(21)} ${e.mac.padEnd(21)} ${e.type}`));
      return true;
    }
    err(lines, `Bad argument ${toks[0]}`); return 1;
  });

  /* ---------------- ROUTE ---------------- */
  def("route", [], {
    summary: "Displays and changes the network routing table.",
    usage: "Manipulates network routing tables.\n\nROUTE [-f] [-p] [command [destination] [MASK netmask] [gateway] [METRIC metric]]\n\n  command      One of these:\n                 PRINT     Prints  a route\n                 ADD       Adds    a route    (requires Administrator)\n                 DELETE    Deletes a route    (requires Administrator)\n                 CHANGE    Modifies an existing route",
  }, (sh, rest, lines, rec) => {
    const toks = tokenize(rest).map((t) => t.v.toLowerCase());
    const cmd = toks.find((t) => !t.startsWith("-")) || "";
    rec.args = toks;
    if (!cmd || cmd === "/?") { showUsage(lines, COMMANDS.route); return cmd ? true : 1; }
    if (cmd === "add" || cmd === "delete" || cmd === "change") {
      if (!sh.admin) { out(lines, "The requested operation requires elevation."); note(lines, msg("need_admin", { cmd: "route " + cmd })); return 1; }
      out(lines, " OK!"); return true;
    }
    if (cmd !== "print") { err(lines, `Bad command: ${cmd}`); return 1; }
    const w = sh.net.wifi;
    const L = (s) => out(lines, s);
    L("==========================================================================="); L("Interface List");
    L(` 12...${sh.net.eth.mac.toLowerCase().replace(/-/g, " ")} ......${sh.net.eth.desc}`);
    L(` 14...${w.mac.toLowerCase().replace(/-/g, " ")} ......${w.desc}`);
    L("  1...........................Software Loopback Interface 1");
    L("==========================================================================="); L("");
    L("IPv4 Route Table"); L("==========================================================================="); L("Active Routes:");
    L("Network Destination        Netmask          Gateway       Interface  Metric");
    if (sh.net.connected) L("          0.0.0.0          0.0.0.0      192.168.1.1     192.168.1.24     35");
    L("        127.0.0.0        255.0.0.0         On-link         127.0.0.1    331");
    L("        127.0.0.1  255.255.255.255         On-link         127.0.0.1    331");
    if (sh.net.connected) {
      L("      192.168.1.0    255.255.255.0         On-link      192.168.1.24    291");
      L("     192.168.1.24  255.255.255.255         On-link      192.168.1.24    291");
      L("    192.168.1.255  255.255.255.255         On-link      192.168.1.24    291");
    }
    L("==========================================================================="); L("Persistent Routes:"); L("  None");
    return true;
  });

  /* ---------------- GETMAC ---------------- */
  def("getmac", [], {
    summary: "Shows the MAC (physical) address of each network adapter.",
    usage: "GETMAC [/FO format] [/NH] [/V]\n\nDescription:\n    This tool enables an administrator to display the MAC address\n    for network adapters on a system.\n\n    /FO    format         Specifies the format in which the output\n                          is to be displayed. Valid values: \"TABLE\", \"LIST\", \"CSV\".\n    /NH                   Specifies that the \"Column Header\" should\n                          not be displayed in the output.\n    /V                    Specifies that verbose output is displayed.",
  }, (sh, rest, lines) => {
    const a = rest.toLowerCase();
    if (a.trim() === "/?") { showUsage(lines, COMMANDS.getmac); return true; }
    const V = /\/v\b/.test(a), NH = /\/nh\b/.test(a);
    out(lines, "");
    if (V) {
      if (!NH) { out(lines, "Connection Name Network Adapter Physical Address    Transport Name"); out(lines, "=============== =============== =================== =========================================================="); }
      out(lines, `Ethernet        Realtek PCIe Gb ${sh.net.eth.mac}   Media disconnected`);
      out(lines, `Wi-Fi           Intel(R) Wi-Fi  ${sh.net.wifi.mac}   ${sh.net.connected ? "\\Device\\Tcpip_{8E4B2D1A-5C3F-4E8A-9B2D-1F7C6A3E5D90}" : "Disconnected"}`);
      return true;
    }
    if (!NH) { out(lines, "Physical Address    Transport Name"); out(lines, "=================== =========================================================="); }
    out(lines, `${sh.net.wifi.mac}   ${sh.net.connected ? "\\Device\\Tcpip_{8E4B2D1A-5C3F-4E8A-9B2D-1F7C6A3E5D90}" : "Disconnected"}`);
    out(lines, `${sh.net.eth.mac}   Media disconnected`);
    return true;
  });
})();
