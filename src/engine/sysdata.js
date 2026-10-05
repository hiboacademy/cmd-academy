/* ============================================================
   engine/sysdata.js — simulated computer: processes, services,
   network, disks. All values are invented for teaching.
   ============================================================ */
const SysData = (() => {
  function processes() {
    const P = (name, pid, session, mem, opts = {}) => ({ name, pid, session, mem, ...opts });
    return [
      P("System Idle Process", 0, "Services", 8, { critical: true, svc: "N/A" }),
      P("System", 4, "Services", 3412, { critical: true, svc: "N/A" }),
      P("Registry", 120, "Services", 61204, { critical: true, svc: "N/A" }),
      P("smss.exe", 412, "Services", 1288, { critical: true, svc: "N/A" }),
      P("csrss.exe", 604, "Services", 6020, { critical: true, svc: "N/A" }),
      P("wininit.exe", 692, "Services", 7104, { critical: true, svc: "N/A" }),
      P("services.exe", 812, "Services", 12560, { critical: true, svc: "N/A" }),
      P("lsass.exe", 828, "Services", 24312, { critical: true, svc: "KeyIso, SamSs, VaultSvc" }),
      P("svchost.exe", 948, "Services", 31508, { svc: "BrokerInfrastructure, DcomLaunch, Power" }),
      P("svchost.exe", 1032, "Services", 18240, { svc: "RpcEptMapper, RpcSs" }),
      P("svchost.exe", 1416, "Services", 9872, { svc: "Dhcp" }),
      P("svchost.exe", 1488, "Services", 11364, { svc: "Dnscache" }),
      P("spoolsv.exe", 2604, "Services", 14920, { svc: "Spooler" }),
      P("MsMpEng.exe", 3120, "Services", 212480, { svc: "WinDefend" }),
      P("SearchIndexer.exe", 3388, "Services", 44100, { svc: "WSearch" }),
      P("csrss.exe", 4712, "Console", 5980, { critical: true, svc: "N/A", session1: true }),
      P("winlogon.exe", 4788, "Console", 11872, { critical: true, svc: "N/A", session1: true }),
      P("dwm.exe", 4996, "Console", 96312, { session1: true, svc: "N/A" }),
      P("explorer.exe", 5120, "Console", 148204, { session1: true, svc: "N/A", title: "File Explorer" }),
      P("chrome.exe", 6204, "Console", 245180, { session1: true, svc: "N/A", title: "CMD Academy - Google Chrome" }),
      P("chrome.exe", 6232, "Console", 48120, { session1: true, svc: "N/A" }),
      P("chrome.exe", 6290, "Console", 96440, { session1: true, svc: "N/A" }),
      P("chrome.exe", 6418, "Console", 33012, { session1: true, svc: "N/A" }),
      P("notepad.exe", 7344, "Console", 14580, { session1: true, svc: "N/A", title: "todo.txt - Notepad" }),
      P("CalculatorApp.exe", 7520, "Console", 41210, { session1: true, svc: "N/A", title: "Calculator" }),
      P("Spotify.exe", 7810, "Console", 182004, { session1: true, svc: "N/A", title: "Spotify Premium", hung: true }),
      P("cmd.exe", 8812, "Console", 5120, { session1: true, svc: "N/A", title: "Command Prompt", self: true }),
      P("conhost.exe", 8820, "Console", 15304, { session1: true, svc: "N/A" }),
      P("tasklist.exe", 9104, "Console", 9212, { session1: true, svc: "N/A", transient: true }),
    ];
  }

  function services() {
    const S = (name, display, state, pid) => ({ name, display, state, pid: pid || 0 });
    return [
      S("AudioSrv", "Windows Audio", "RUNNING", 1880),
      S("BITS", "Background Intelligent Transfer Service", "STOPPED"),
      S("bthserv", "Bluetooth Support Service", "RUNNING", 2240),
      S("Dhcp", "DHCP Client", "RUNNING", 1416),
      S("Dnscache", "DNS Client", "RUNNING", 1488),
      S("Fax", "Fax", "STOPPED"),
      S("Spooler", "Print Spooler", "RUNNING", 2604),
      S("Themes", "Themes", "RUNNING", 1960),
      S("W32Time", "Windows Time", "STOPPED"),
      S("WinDefend", "Microsoft Defender Antivirus Service", "RUNNING", 3120),
      S("WSearch", "Windows Search", "RUNNING", 3388),
      S("wuauserv", "Windows Update", "STOPPED"),
    ];
  }

  function network() {
    return {
      connected: true,
      hostname: "ACADEMY-PC",
      wifi: {
        desc: "Intel(R) Wi-Fi 6 AX201 160MHz", mac: "3C-52-82-4A-1F-9B",
        ip: "192.168.1.24", mask: "255.255.255.0", gw: "192.168.1.1", dns: ["192.168.1.1", "8.8.8.8"],
        v6: "fe80::8d2c:4b1e:9a3f:12%14", dhcpServer: "192.168.1.1",
        leaseObtained: "Monday, October 5, 2026 8:02:11 AM", leaseExpires: "Tuesday, October 6, 2026 8:02:11 AM",
      },
      eth: { desc: "Realtek PCIe GbE Family Controller", mac: "A4-BB-6D-10-77-E2" },
      dnsCache: [],
      hosts: {
        "localhost": "127.0.0.1",
        "google.com": "142.250.185.78", "www.google.com": "142.250.185.68",
        "microsoft.com": "20.70.246.20", "www.microsoft.com": "23.45.229.117",
        "example.com": "93.184.215.14", "www.example.com": "93.184.215.14",
        "wikipedia.org": "185.15.59.224", "github.com": "140.82.121.4",
        "dns.google": "8.8.8.8", "one.one.one.one": "1.1.1.1",
        "router.home": "192.168.1.1", "printer.home": "192.168.1.50",
      },
      // hosts that exist but never answer ping (firewall)
      silent: ["10.0.0.99", "192.168.1.200"],
      arp: [
        { ip: "192.168.1.1", mac: "f4-6b-ef-12-a0-01", type: "dynamic" },
        { ip: "192.168.1.50", mac: "00-1e-0b-77-31-c4", type: "dynamic" },
        { ip: "192.168.1.255", mac: "ff-ff-ff-ff-ff-ff", type: "static" },
        { ip: "224.0.0.22", mac: "01-00-5e-00-00-16", type: "static" },
        { ip: "239.255.255.250", mac: "01-00-5e-7f-ff-fa", type: "static" },
      ],
      conns: [
        { proto: "TCP", local: "0.0.0.0:135", remote: "0.0.0.0:0", state: "LISTENING", pid: 1032, exe: "RpcSs" },
        { proto: "TCP", local: "0.0.0.0:445", remote: "0.0.0.0:0", state: "LISTENING", pid: 4, exe: "System" },
        { proto: "TCP", local: "192.168.1.24:139", remote: "0.0.0.0:0", state: "LISTENING", pid: 4, exe: "System" },
        { proto: "TCP", local: "192.168.1.24:52114", remote: "142.250.185.78:443", state: "ESTABLISHED", pid: 6204, exe: "chrome.exe", rname: "fra16s48-in-f14:https" },
        { proto: "TCP", local: "192.168.1.24:52118", remote: "140.82.121.4:443", state: "ESTABLISHED", pid: 6204, exe: "chrome.exe", rname: "lb-140-82-121-4-fra:https" },
        { proto: "TCP", local: "192.168.1.24:52140", remote: "35.186.224.25:443", state: "ESTABLISHED", pid: 7810, exe: "Spotify.exe", rname: "25.224.186.35.bc:https" },
        { proto: "TCP", local: "192.168.1.24:52151", remote: "20.70.246.20:443", state: "TIME_WAIT", pid: 0, exe: "" },
        { proto: "UDP", local: "0.0.0.0:5353", remote: "*:*", state: "", pid: 6204, exe: "chrome.exe" },
        { proto: "UDP", local: "192.168.1.24:137", remote: "*:*", state: "", pid: 4, exe: "System" },
      ],
      // hops to the internet for tracert
      hops: [
        { ip: "192.168.1.1", name: "router.home", ms: [1, 1, 1] },
        { ip: "100.64.12.1", name: null, ms: [8, 7, 9] },
        { ip: "*", name: null, ms: null },
        { ip: "212.95.34.17", name: "core1.vie.isp.example", ms: [11, 10, 12] },
        { ip: "72.14.215.130", name: null, ms: [14, 13, 14] },
      ],
    };
  }

  function disks() {
    return [
      {
        n: 0, size: "476 GB", free: "1024 KB", gpt: true, model: "NVMe Academy SSD 512GB", type: "NVMe", system: true,
        parts: [
          { n: 1, type: "System", size: "100 MB", fs: "FAT32", letter: "", label: "", info: "System", hidden: true },
          { n: 2, type: "Reserved", size: "16 MB", fs: "", letter: null },
          { n: 3, type: "Primary", size: "300 GB", fs: "NTFS", letter: "C", label: "", info: "Boot" },
          { n: 4, type: "Primary", size: "175 GB", fs: "NTFS", letter: "D", label: "Data", info: "" },
          { n: 5, type: "Recovery", size: "700 MB", fs: "NTFS", letter: "", label: "Recovery", info: "Hidden", hidden: true },
        ],
      },
      {
        n: 1, size: "14 GB", free: "0 B", gpt: false, model: "USB Flash Drive", type: "USB", removable: true,
        parts: [{ n: 1, type: "Primary", size: "14 GB", fs: "FAT32", letter: "E", label: "USB", info: "" }],
      },
    ];
  }

  function systemInfo() {
    return [
      ["Host Name", "ACADEMY-PC"],
      ["OS Name", "Microsoft Windows 11 Pro"],
      ["OS Version", "10.0.22631 N/A Build 22631"],
      ["OS Manufacturer", "Microsoft Corporation"],
      ["OS Configuration", "Standalone Workstation"],
      ["OS Build Type", "Multiprocessor Free"],
      ["Registered Owner", "Student"],
      ["Product ID", "00330-80000-00000-AA000"],
      ["Original Install Date", "9/20/2026, 9:12:04 AM"],
      ["System Boot Time", "10/5/2026, 8:01:37 AM"],
      ["System Manufacturer", "Academy Computers"],
      ["System Model", "Student Laptop 14"],
      ["System Type", "x64-based PC"],
      ["Processor(s)", "1 Processor(s) Installed.\n                           [01]: Intel64 Family 6 Model 140 Stepping 1 GenuineIntel ~2803 Mhz"],
      ["BIOS Version", "Academy BIOS 1.12.0, 3/14/2026"],
      ["Windows Directory", "C:\\Windows"],
      ["System Directory", "C:\\Windows\\system32"],
      ["Boot Device", "\\Device\\HarddiskVolume1"],
      ["System Locale", "en-us;English (United States)"],
      ["Input Locale", "en-us;English (United States)"],
      ["Time Zone", "(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna"],
      ["Total Physical Memory", "16,084 MB"],
      ["Available Physical Memory", "9,212 MB"],
      ["Virtual Memory: Max Size", "18,516 MB"],
      ["Virtual Memory: Available", "10,404 MB"],
      ["Virtual Memory: In Use", "8,112 MB"],
      ["Page File Location(s)", "C:\\pagefile.sys"],
      ["Domain", "WORKGROUP"],
      ["Logon Server", "\\\\ACADEMY-PC"],
      ["Hotfix(s)", "2 Hotfix(s) Installed.\n                           [01]: KB5031274\n                           [02]: KB5032190"],
      ["Network Card(s)", "2 NIC(s) Installed.\n                           [01]: Intel(R) Wi-Fi 6 AX201 160MHz\n                                 Connection Name: Wi-Fi\n                                 DHCP Enabled:    Yes\n                                 DHCP Server:     192.168.1.1\n                                 IP address(es)\n                                 [01]: 192.168.1.24\n                           [02]: Realtek PCIe GbE Family Controller\n                                 Connection Name: Ethernet\n                                 Status:          Media disconnected"],
      ["Hyper-V Requirements", "A hypervisor has been detected. Features required for Hyper-V will not be displayed."],
    ];
  }

  return { processes, services, network, disks, systemInfo };
})();
