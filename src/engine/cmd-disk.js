/* ============================================================
   engine/cmd-disk.js — disks and repair tools (all simulated)
   chkdsk sfc dism format diskpart bootrec bcdboot bcdedit label
   ============================================================ */
(() => {
  const { def, lib, COMMANDS } = Shell;
  const { out, err, note, warn, msg, tokenize, showUsage, ask } = lib;

  const driveLetterArg = (sh, rest) => {
    const m = rest.match(/\b([a-z]):/i);
    return m ? m[1].toUpperCase() : sh.mode === "winre" ? "C" : sh.drive;
  };

  /* ---------------- CHKDSK ---------------- */
  def("chkdsk", [], {
    summary: "Checks a disk for file system errors (and repairs with /F).",
    usage: "Checks a disk and displays a status report.\n\nCHKDSK [volume[[path]filename]]] [/F] [/R] [/X] [/SCAN]\n\n  volume          Specifies the drive letter (followed by a colon).\n  /F              Fixes errors on the disk.\n  /R              Locates bad sectors and recovers readable information\n                  (implies /F).\n  /X              Forces the volume to dismount first if necessary.\n  /SCAN           Runs an online scan on the volume.",
    admin: true,
    adminError: "Access Denied as you do not have sufficient privileges or\nthe disk may be locked by another process.\nYou have to invoke this utility running in elevated mode\nand make sure the disk is unlocked.",
    danger: true,
  }, function* (sh, rest, lines, rec) {
    const toks = tokenize(rest).map((t) => t.v.toLowerCase());
    if (toks.includes("/?")) { showUsage(lines, COMMANDS.chkdsk); return true; }
    const L = driveLetterArg(sh, rest);
    rec.args = [L + ":"]; rec.switches = toks.filter((t) => t.startsWith("/"));
    const d = VFS.getDrive(sh.fs, L);
    if (!d) { err(lines, "The specified volume cannot be found."); return 3; }
    const fix = toks.includes("/f") || toks.includes("/r");
    out(lines, `The type of the file system is ${d.fs}.`);
    if (fix && (d.system || (sh.mode !== "winre" && L === "C"))) {
      if (sh.mode !== "winre") {
        out(lines, "Cannot lock current drive.");
        out(lines, "");
        const a = (yield* ask("Chkdsk cannot run because the volume is in use by another\nprocess.  Would you like to schedule this volume to be\nchecked the next time the system restarts? (Y/N) ", "line")).trim();
        if (/^y/i.test(a)) { out(lines, ""); out(lines, "This volume will be checked the next time the system restarts."); note(lines, msg("chkdsk_scheduled")); }
        return true;
      }
    }
    if (fix && !d.removable && L !== "C" && sh.mode !== "winre" && !toks.includes("/x")) {
      const a = (yield* ask("Chkdsk cannot run because the volume is in use by another\nprocess.  Chkdsk may run if this volume is dismounted first.\nALL OPENED HANDLES TO THIS VOLUME WOULD THEN BE INVALID.\nWould you like to force a dismount on this volume? (Y/N) ", "line")).trim();
      if (!/^y/i.test(a)) return true;
      out(lines, "Volume dismounted.  All opened handles to this volume are now invalid.");
    }
    if (d.label) out(lines, `Volume label is ${d.label}.`);
    if (!fix) { out(lines, ""); out(lines, "WARNING!  /F parameter not specified."); out(lines, "Running CHKDSK in read-only mode."); }
    out(lines, "");
    if (d.fs === "FAT32") {
      out(lines, `Volume Serial Number is ${d.serial}`);
      out(lines, "Windows is verifying files and folders...");
      yield { kind: "sleep", ms: 900 };
      out(lines, "File and folder verification is complete.");
    } else {
      out(lines, "Stage 1: Examining basic file system structure ...");
      yield { kind: "sleep", ms: 700 };
      out(lines, "  412160 file records processed.");
      out(lines, "File verification completed.");
      out(lines, "Stage 2: Examining file name linkage ...");
      yield { kind: "sleep", ms: 700 };
      out(lines, "  538914 index entries processed.");
      out(lines, "Index verification completed.");
      out(lines, "Stage 3: Examining security descriptors ...");
      yield { kind: "sleep", ms: 500 };
      out(lines, "Security descriptor verification completed.");
      if (toks.includes("/r")) {
        out(lines, "Stage 4: Looking for bad clusters in user file data ...");
        yield { kind: "sleep", ms: 900 };
        out(lines, "  412144 files processed.");
        out(lines, "Stage 5: Looking for bad, free clusters ...");
        yield { kind: "sleep", ms: 900 };
        out(lines, "  68203110 free clusters processed.");
      }
    }
    out(lines, "");
    if (sh.diskErrors && sh.diskErrors[L] && fix) {
      out(lines, "Windows has made corrections to the file system.");
      out(lines, "No further action is required.");
      sh.diskErrors[L] = false;
    } else if (sh.diskErrors && sh.diskErrors[L]) {
      out(lines, "Windows has scanned the file system and found problems.");
      out(lines, "Run CHKDSK with the /F (fix) option to correct these.");
      note(lines, msg("chkdsk_found"));
      return 1;
    } else {
      out(lines, "Windows has scanned the file system and found no problems.");
      out(lines, "No further action is required.");
    }
    out(lines, "");
    const big = d.removable ? "  14,666,240" : L === "D" ? " 183,500,800" : " 314,572,799";
    out(lines, `${big} KB total disk space.`);
    out(lines, `${String(Math.round(d.free / 1024).toLocaleString("en-US")).padStart(12)} KB available on disk.`);
    return true;
  });

  /* ---------------- SFC ---------------- */
  def("sfc", [], {
    summary: "Scans Windows system files and repairs damaged ones.",
    usage: "Microsoft (R) Windows (R) Resource Checker Version 6.0\n\nScans the integrity of all protected system files and replaces incorrect versions with\ncorrect Microsoft versions.\n\nSFC [/SCANNOW] [/VERIFYONLY] [/OFFBOOTDIR=<offline boot directory> /OFFWINDIR=<offline windows directory>]\n\n/SCANNOW        Scans integrity of all protected system files and repairs files with\n                problems when possible.\n/VERIFYONLY     Scans integrity of all protected system files. No repair operation is\n                performed.\n/OFFBOOTDIR     For offline repair, specify the location of the offline boot directory\n/OFFWINDIR      For offline repair, specify the location of the offline windows directory",
    admin: (rest) => /\/scannow|\/verifyonly/i.test(rest) ? true : false,
    adminError: "You must be an administrator running a console session in order to\nuse the sfc utility.",
  }, function* (sh, rest, lines, rec) {
    const a = rest.toLowerCase();
    rec.switches = (a.match(/\/[a-z]+/g) || []);
    if (!/\/scannow|\/verifyonly/.test(a)) { showUsage(lines, COMMANDS.sfc); return true; }
    if (sh.mode === "winre" && !/offwindir/.test(a)) {
      out(lines, "There is a system repair pending which requires reboot to complete.  Restart"); out(lines, "Windows and run sfc again.");
      note(lines, msg("sfc_offline")); return 1;
    }
    out(lines, "");
    out(lines, "Beginning system scan.  This process will take some time.");
    out(lines, "");
    out(lines, "Beginning verification phase of system scan.");
    for (const p of [12, 37, 64, 88, 100]) { yield { kind: "sleep", ms: 450 }; if (p === 100) out(lines, "Verification 100% complete."); }
    out(lines, "");
    if (sh.sysCorrupt) {
      if (/verifyonly/.test(a)) { out(lines, "Windows Resource Protection found integrity violations."); return 1; }
      out(lines, "Windows Resource Protection found corrupt files and successfully repaired them.");
      out(lines, "For online repairs, details are included in the CBS log file located at");
      out(lines, "windir\\Logs\\CBS\\CBS.log.");
      sh.sysCorrupt = false;
      note(lines, msg("sfc_repaired"));
      return true;
    }
    out(lines, "Windows Resource Protection did not find any integrity violations.");
    return true;
  });

  /* ---------------- DISM ---------------- */
  def("dism", [], {
    summary: "Checks and repairs the Windows image (component store).",
    usage: "Deployment Image Servicing and Management tool\nVersion: 10.0.22621.2792\n\nDISM.exe [dism_options] {Imaging_command} [<Imaging_arguments>]\nDISM.exe {/Image:<path_to_offline_image> | /Online} [dism_options]\n         {servicing_command} [<servicing_arguments>]\n\n  /Online /Cleanup-Image /CheckHealth    - Quick check for corruption flags.\n  /Online /Cleanup-Image /ScanHealth     - Full scan of the component store.\n  /Online /Cleanup-Image /RestoreHealth  - Scan and repair using Windows Update.",
    admin: (rest) => /\/online/i.test(rest) ? true : false,
    adminError: "\nDeployment Image Servicing and Management tool\nVersion: 10.0.22621.2792\n\n\nError: 740\n\nElevated permissions are required to run DISM.\nUse an elevated command prompt to complete these tasks.",
  }, function* (sh, rest, lines, rec) {
    const a = rest.toLowerCase();
    rec.switches = (a.match(/\/[a-z-]+/g) || []);
    out(lines, "");
    out(lines, "Deployment Image Servicing and Management tool");
    out(lines, "Version: 10.0.22621.2792");
    out(lines, "");
    if (!/\/online|\/image:/.test(a) || !/\/cleanup-image/.test(a)) {
      if (/\/\?/.test(a) || !a.trim()) { showUsage(lines, COMMANDS.dism); return true; }
      err(lines, "Error: 87"); out(lines, ""); err(lines, "The option is unknown."); note(lines, msg("dism_usage")); return 87;
    }
    out(lines, "Image Version: 10.0.22631.4317");
    out(lines, "");
    const bar = (txt) => `[==========================100.0%==========================] ${txt}`;
    if (/\/checkhealth/.test(a)) {
      out(lines, sh.storeCorrupt ? "The component store is repairable." : "No component store corruption detected.");
      out(lines, "The operation completed successfully.");
      return true;
    }
    if (/\/scanhealth/.test(a)) {
      yield { kind: "sleep", ms: 1500 };
      out(lines, bar(sh.storeCorrupt ? "The component store is repairable." : "No component store corruption detected."));
      out(lines, "The operation completed successfully.");
      return true;
    }
    if (/\/restorehealth/.test(a)) {
      if (!sh.net.connected && !/\/source:/.test(a)) {
        yield { kind: "sleep", ms: 1200 };
        out(lines, "[===========================84.9%=================         ]");
        err(lines, "Error: 0x800f081f"); out(lines, ""); err(lines, "The source files could not be found.");
        note(lines, msg("dism_offline")); return 0x81f;
      }
      yield { kind: "sleep", ms: 2000 };
      out(lines, bar("The restore operation completed successfully."));
      out(lines, "The operation completed successfully.");
      sh.storeCorrupt = false;
      return true;
    }
    err(lines, "Error: 87"); err(lines, "The cleanup-image option is unknown."); return 87;
  });

  /* ---------------- FORMAT ---------------- */
  def("format", [], {
    summary: "Formats a disk: ERASES everything on it (simulated).",
    usage: "Formats a disk for use with Windows.\n\nFORMAT volume [/FS:file-system] [/V:label] [/Q] [/Y]\n\n  volume          Specifies the drive letter (followed by a colon).\n  /FS:filesystem  Specifies the type of the file system (FAT32, exFAT, NTFS).\n  /V:label        Specifies the volume label.\n  /Q              Performs a quick format.\n  /Y              Does not ask for confirmation.",
    admin: true,
    adminError: "Access Denied as you do not have sufficient privileges.\nYou have to invoke this utility running in elevated mode.",
    danger: true,
  }, function* (sh, rest, lines, rec) {
    const toks = tokenize(rest).map((t) => t.v);
    if (toks.includes("/?")) { showUsage(lines, COMMANDS.format); return true; }
    const dm = rest.match(/\b([a-z]):/i);
    if (!dm) { err(lines, "Required parameter missing -"); note(lines, msg("format_drive")); return 1; }
    const L = dm[1].toUpperCase();
    rec.args = [L + ":"]; rec.switches = toks.filter((t) => t.startsWith("/")).map((t) => t.toLowerCase());
    const d = VFS.getDrive(sh.fs, L);
    if (!d) { err(lines, "Invalid drive specification."); return 1; }
    warn(lines, msg("format_warn"));
    const fsm = rest.match(/\/fs:(\w+)/i);
    const fs = fsm ? fsm[1].toUpperCase().replace("EXFAT", "exFAT") : d.fs;
    const vm = rest.match(/\/v:("[^"]*"|\S+)/i);
    const Y = /\/y\b/i.test(rest);
    if (d.removable) {
      yield* ask(`Insert new disk for drive ${L}:\nand press ENTER when ready...`, "key");
    } else {
      out(lines, `The type of the file system is ${d.fs}.`);
      if (!Y) {
        const a = (yield* ask(`WARNING, ALL DATA ON NON-REMOVABLE DISK\nDRIVE ${L}: WILL BE LOST!\nProceed with Format (Y/N)? `)).trim();
        if (!/^y/i.test(a)) return true;
      }
      if (L === "C" || d.system || d.ram) { err(lines, "Cannot lock current drive."); note(lines, msg("format_system")); return 1; }
    }
    out(lines, `The type of the file system is ${d.fs}.`);
    out(lines, `The new file system is ${fs}.`);
    out(lines, `${/\/q/i.test(rest) ? "QuickFormatting" : "Verifying"} ${d.removable ? "14.0 GB" : "175.0 GB"}`);
    yield { kind: "sleep", ms: /\/q/i.test(rest) ? 700 : 1600 };
    let label = vm ? vm[1].replace(/"/g, "") : null;
    if (label == null) label = (yield* ask(`Volume label (${fs === "NTFS" ? 32 : 11} characters, ENTER for none)? `)).trim();
    out(lines, "Creating file system structures.");
    out(lines, "Format complete.");
    out(lines, `   ${d.removable ? "14.0 GB" : "175.0 GB"} total disk space.`);
    out(lines, `   ${d.removable ? "14.0 GB" : "175.0 GB"} are available.`);
    d.root = VFS.emptyRoot();
    d.fs = fs; d.label = label || "";
    sh.cwd[L] = [];
    note(lines, msg("format_done", { drive: L }));
    return true;
  });

  def("label", [], { summary: "Creates, changes, or deletes the volume label of a disk.", usage: "Creates, changes, or deletes the volume label of a disk.\n\nLABEL [drive:][label]", admin: (r) => /\S/.test(r.replace(/^\s*[a-z]:\s*/i, "")) ? true : false }, function* (sh, rest, lines) {
    const m = rest.trim().match(/^([a-z]):\s*(.*)$/i);
    const L = m ? m[1].toUpperCase() : sh.drive;
    const d = VFS.getDrive(sh.fs, L);
    if (!d) { err(lines, "Invalid drive specification."); return 1; }
    let newLabel = m ? m[2] : rest.trim();
    if (!newLabel) {
      out(lines, d.label ? `Volume in drive ${L}: is ${d.label}` : `Volume in drive ${L}: has no label`);
      out(lines, `Volume Serial Number is ${d.serial}`);
      newLabel = (yield* ask("Volume label (32 characters, ENTER for none)? ")).trim();
    }
    d.label = newLabel;
    return true;
  });

  /* ---------------- DISKPART ---------------- */
  def("diskpart", [], {
    summary: "Manages disks, partitions and volumes (simulated, dangerous).",
    usage: "Microsoft DiskPart version 10.0.22621.1\n\nDISKPART commands (type them at the DISKPART> prompt):\n\nLIST        - Display a list of objects (disk, partition, volume).\nSELECT      - Shift the focus to an object.\nDETAIL      - Provide details about an object.\nCLEAN       - Clear the configuration information, or all information, off the disk.\nCREATE      - Create a volume, partition or virtual disk.\nFORMAT      - Format the volume or partition.\nASSIGN      - Assign a drive letter or mount point to the selected volume.\nREMOVE      - Remove a drive letter or mount point assignment.\nDELETE      - Delete an object.\nEXIT        - Exit DiskPart.\nHELP        - Display a list of commands.",
    admin: true,
    adminError: "DiskPart needs administrator rights (in Windows a UAC window would appear).",
    danger: true,
  }, function* (sh, rest, lines, rec) {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.diskpart); return true; }
    out(lines, "");
    out(lines, "Microsoft DiskPart version 10.0.22621.1");
    out(lines, "");
    out(lines, "Copyright (C) Microsoft Corporation.");
    out(lines, `On computer: ${sh.mode === "winre" ? "MININT-7Q2K1RB" : "ACADEMY-PC"}`);
    out(lines, "");
    warn(lines, msg("diskpart_warn"));
    const st = { disk: null, part: null, vol: null };
    rec.dp = [];
    for (let guard = 0; guard < 300; guard++) {
      const line = (yield* ask("DISKPART> ", "line", { noStdin: false })).trim();
      if (!line) continue;
      rec.dp.push(line.toLowerCase());
      if (/^(exit|quit)$/i.test(line)) { out(lines, ""); out(lines, "Leaving DiskPart..."); return true; }
      dpCommand(sh, st, line, lines);
      out(lines, "");
    }
    return true;
  });

  function volumes(sh) {
    const v = [];
    sh.disks.forEach((d) => d.parts.forEach((p) => { if (p.type !== "Reserved") v.push({ disk: d, part: p }); }));
    return v;
  }
  function dpCommand(sh, st, line, lines) {
    const w = line.toLowerCase().split(/\s+/);
    const a0 = w[0], a1 = w[1] || "";
    const needDisk = () => { if (!st.disk) { out(lines, ""); out(lines, "There is no disk selected to list partitions."); out(lines, ""); out(lines, "Select a disk and try again."); return false; } return true; };
    out(lines, "");
    if (a0 === "help") { COMMANDS.diskpart.usage.split("\n").slice(2).forEach((l) => out(lines, l)); return; }
    if (a0 === "rescan") { out(lines, "Please wait while DiskPart scans your configuration..."); out(lines, ""); out(lines, "DiskPart has finished scanning your configuration."); return; }
    if (a0 === "list" && a1.startsWith("dis")) {
      out(lines, "  Disk ###  Status         Size     Free     Dyn  Gpt");
      out(lines, "  --------  -------------  -------  -------  ---  ---");
      sh.disks.forEach((d) => out(lines, `${st.disk === d ? "*" : " "} Disk ${d.n}    Online        ${d.size.padStart(7)}  ${d.free.padStart(7)}        ${d.gpt ? "*" : ""}`.trimEnd()));
      return;
    }
    if (a0 === "list" && a1.startsWith("vol")) {
      out(lines, "  Volume ###  Ltr  Label        Fs     Type        Size     Status     Info");
      out(lines, "  ----------  ---  -----------  -----  ----------  -------  ---------  --------");
      volumes(sh).forEach((v, i) => {
        const p = v.part;
        out(lines, `${st.vol === p ? "*" : " "} Volume ${i}     ${(p.letter || " ").padEnd(3)}  ${(p.label || "").padEnd(11)}  ${(p.fs || "RAW").padEnd(5)}  ${(v.disk.removable ? "Removable" : "Partition").padEnd(10)}  ${p.size.padStart(7)}  Healthy    ${p.info || ""}`.trimEnd());
      });
      return;
    }
    if (a0 === "list" && a1.startsWith("par")) {
      if (!needDisk()) return;
      if (!st.disk.parts.length) { out(lines, "There are no partitions on this disk to show."); return; }
      out(lines, "  Partition ###  Type              Size     Offset");
      out(lines, "  -------------  ----------------  -------  -------");
      st.disk.parts.forEach((p) => out(lines, `${st.part === p ? "*" : " "} Partition ${p.n}    ${p.type.padEnd(16)}  ${p.size.padStart(7)}  1024 KB`));
      return;
    }
    if (a0 === "sel" || a0 === "select") {
      const n = w[2];
      if (a1.startsWith("dis")) {
        const d = sh.disks.find((x) => String(x.n) === n);
        if (!d) { out(lines, "The disk you specified is not valid."); out(lines, ""); out(lines, "There is no disk selected."); st.disk = null; return; }
        st.disk = d; st.part = null; out(lines, `Disk ${d.n} is now the selected disk.`); return;
      }
      if (a1.startsWith("par")) {
        if (!needDisk()) return;
        const p = st.disk.parts.find((x) => String(x.n) === n);
        if (!p) { out(lines, "The partition you specified is not valid."); out(lines, "Please select a valid partition."); out(lines, ""); out(lines, "There is no partition selected."); return; }
        st.part = p; st.vol = p; out(lines, `Partition ${p.n} is now the selected partition.`); return;
      }
      if (a1.startsWith("vol")) {
        const vols = volumes(sh);
        const v = /^[a-z]$/i.test(n || "") ? vols.find((x) => (x.part.letter || "").toLowerCase() === n.toLowerCase()) : vols[parseInt(n, 10)];
        if (!v) { out(lines, "The volume you selected is not valid or does not exist."); return; }
        st.vol = v.part; st.part = v.part; st.disk = v.disk; out(lines, `Volume ${vols.indexOf(v)} is the selected volume.`); return;
      }
    }
    if (a0 === "detail" && a1.startsWith("dis")) {
      if (!st.disk) { out(lines, "There is no disk selected."); return; }
      out(lines, st.disk.model); out(lines, `Disk ID: {${st.disk.removable ? "6A1F0C22" : "B7E2C914"}-3F11-4C9A-9A3D-2E41F0D7C1A8}`); out(lines, `Type   : ${st.disk.type}`); out(lines, "Status : Online");
      out(lines, `Boot Disk  : ${st.disk.system ? "Yes" : "No"}`); out(lines, `Removable Media  : ${st.disk.removable ? "Yes" : "No"}`); return;
    }
    if (a0 === "clean") {
      if (!st.disk) { out(lines, "There is no disk selected."); out(lines, "Please select a disk and try again."); return; }
      if (st.disk.system) { out(lines, "Virtual Disk Service error:"); out(lines, "Clean is not allowed on the disk containing the current boot,"); out(lines, "system, pagefile, crashdump or hibernation volume."); lib.note(lines, msg("diskpart_protect")); return; }
      st.disk.parts.forEach((p) => { if (p.letter) dropDrive(sh, p.letter); });
      st.disk.parts = []; st.disk.free = st.disk.size; st.part = null; st.vol = null;
      out(lines, "DiskPart succeeded in cleaning the disk.");
      warn(lines, msg("diskpart_cleaned", { n: st.disk.n }));
      return;
    }
    if (a0 === "create" && a1.startsWith("par")) {
      if (!st.disk) { out(lines, "There is no disk selected."); return; }
      if (st.disk.parts.length && st.disk.free === "0 B") { out(lines, "Virtual Disk Service error:"); out(lines, "There is not enough usable space for this operation."); return; }
      const p = { n: st.disk.parts.length + 1, type: "Primary", size: st.disk.size, fs: "RAW", letter: null, label: "", info: "" };
      st.disk.parts.push(p); st.disk.free = "0 B"; st.part = p; st.vol = p;
      out(lines, "DiskPart succeeded in creating the specified partition.");
      return;
    }
    if (a0 === "format") {
      const p = st.vol || st.part;
      if (!p) { out(lines, "There is no volume selected."); out(lines, "Please select a volume and try again."); return; }
      if (p.letter === "C" || p.type === "System" || p.info === "Boot") { out(lines, "Virtual Disk Service error:"); out(lines, "The operation is not allowed on the system or boot volume."); return; }
      const fsm = line.match(/fs=(\w+)/i);
      p.fs = fsm ? fsm[1].toUpperCase().replace("EXFAT", "exFAT") : "NTFS";
      const lm = line.match(/label=("[^"]*"|\S+)/i);
      p.label = lm ? lm[1].replace(/"/g, "") : "";
      out(lines, "  100 percent completed"); out(lines, ""); out(lines, "DiskPart successfully formatted the volume.");
      if (p.letter) { const d = VFS.getDrive(sh.fs, p.letter); if (d) { d.root = VFS.emptyRoot(); d.fs = p.fs; d.label = p.label; sh.cwd[p.letter] = []; } }
      return;
    }
    if (a0 === "assign") {
      const p = st.vol || st.part;
      if (!p) { out(lines, "There is no volume selected."); return; }
      const lm = line.match(/letter=([a-z])/i);
      const L = lm ? lm[1].toUpperCase() : ["E", "F", "G", "H"].find((x) => !sh.fs.drives[x]);
      if (sh.fs.drives[L]) { out(lines, "Virtual Disk Service error:"); out(lines, "The specified drive letter is not free to be assigned."); return; }
      p.letter = L;
      sh.fs.drives[L] = { label: p.label || "", serial: "4D2E-" + (1000 + Math.floor(Math.random() * 8999)), fs: p.fs || "RAW", free: 15021309952, root: VFS.emptyRoot(), removable: !!st.disk && !!st.disk.removable };
      sh.cwd[L] = [];
      out(lines, "DiskPart successfully assigned the drive letter or mount point.");
      return;
    }
    if (a0 === "remove") {
      const p = st.vol || st.part;
      if (!p || !p.letter) { out(lines, "There is no volume selected."); return; }
      if (p.letter === "C") { out(lines, "Virtual Disk Service error:"); out(lines, "The operation is not allowed on the system or boot volume."); return; }
      dropDrive(sh, p.letter); p.letter = null;
      out(lines, "DiskPart successfully removed the drive letter or mount point.");
      return;
    }
    if (a0 === "delete" && a1.startsWith("par")) {
      if (!st.part) { out(lines, "There is no partition selected."); return; }
      if (st.disk.system) { out(lines, "Virtual Disk Service error:"); out(lines, "Cannot delete a protected partition without the force protected parameter set."); lib.note(lines, msg("diskpart_protect")); return; }
      if (st.part.letter) dropDrive(sh, st.part.letter);
      st.disk.parts = st.disk.parts.filter((x) => x !== st.part); st.disk.free = st.disk.size; st.part = null; st.vol = null;
      out(lines, "DiskPart successfully deleted the selected partition.");
      return;
    }
    if (a0 === "active") { if (!st.part) { out(lines, "There is no partition selected."); return; } out(lines, st.disk.gpt ? "The selected disk is not a fixed MBR disk.\nThe ACTIVE command can only be used on fixed MBR disks." : "DiskPart marked the current partition as active."); return; }
    out(lines, "Microsoft DiskPart version 10.0.22621.1"); out(lines, "");
    out(lines, `The arguments specified for this command are not valid.`);
    lib.note(lines, msg("diskpart_help"));
  }
  function dropDrive(sh, L) {
    delete sh.fs.drives[L];
    delete sh.cwd[L];
    if (sh.drive === L) sh.drive = sh.mode === "winre" ? "X" : "C";
  }

  /* ---------------- BOOTREC (Recovery Environment only) ---------------- */
  def("bootrec", [], {
    summary: "Repairs Windows startup (only in the Recovery Environment).",
    usage: "BOOTREC.EXE - Bootrec Utility for Windows\n\nUsage: BOOTREC.EXE options\n\n/FixMbr     The /FixMbr option writes a Windows-compatible MBR to the\n            system partition.\n/FixBoot    The /FixBoot option writes a new boot sector onto the system\n            partition.\n/ScanOs     The /ScanOs option scans all disks for Windows installations\n            and displays entries that are not currently in the BCD store.\n/RebuildBcd The /RebuildBcd option scans all disks for Windows installations\n            and allows the user to select which to add to the BCD store.",
    winre: true,
    danger: true,
  }, function* (sh, rest, lines, rec) {
    const a = rest.trim().toLowerCase();
    rec.switches = a ? [a] : [];
    if (!a || a === "/?") { showUsage(lines, COMMANDS.bootrec); return true; }
    const scan = function* () {
      out(lines, "Scanning all disks for Windows installations.");
      out(lines, ""); out(lines, "Please wait, since this may take a while...");
      yield { kind: "sleep", ms: 1200 };
      out(lines, ""); out(lines, "Successfully scanned Windows installations.");
      out(lines, "Total identified Windows installations: 1");
      out(lines, "[1]  C:\\Windows");
    };
    if (a === "/fixmbr") { out(lines, "The operation completed successfully."); note(lines, msg("bootrec_mbr")); return true; }
    if (a === "/fixboot") { err(lines, "Access is denied."); note(lines, msg("bootrec_fixboot")); return 5; }
    if (a === "/scanos") { yield* scan(); out(lines, "The operation completed successfully."); return true; }
    if (a === "/rebuildbcd") {
      yield* scan();
      const ans = (yield* ask("Add installation to boot list? Yes(Y)/No(N)/All(A):", "line")).trim();
      if (/^[ya]/i.test(ans)) { out(lines, "The operation completed successfully."); sh.bootBroken = false; }
      else out(lines, "The operation was cancelled.");
      return true;
    }
    err(lines, `Invalid parameter - ${rest.trim()}`); return 87;
  });

  def("bcdboot", [], {
    summary: "Recreates the Windows boot files on the system partition.",
    usage: "Bcdboot - Bcd boot file creation and repair tool.\n\nbcdboot <source> [/l <locale>] [/s <volume-letter> [/f <firmware>]]\n\n    source     Specifies the location of the windows system root.\n\nExample: bcdboot C:\\Windows",
    admin: true,
  }, (sh, rest, lines) => {
    const a = rest.trim();
    if (!a || a === "/?") { showUsage(lines, COMMANDS.bcdboot); return a ? true : 1; }
    const p = lib.P(sh, a.split(/\s+/)[0]);
    const n = lib.R(sh, p).node;
    if (!n || n.type !== "dir" || !n.children["system32"]) { err(lines, "Failure when attempting to copy boot files."); note(lines, msg("bcdboot_path")); return 1; }
    out(lines, "Boot files successfully created.");
    sh.bootBroken = false;
    return true;
  });

  def("bcdedit", [], {
    summary: "Shows or edits the boot configuration (BCD) store.",
    usage: "BCDEDIT - Boot Configuration Data Store Editor\n\nbcdedit [/enum]\n\n  /enum      Lists entries in a store.",
    admin: true,
    adminError: "The boot configuration data store could not be opened.\nAccess is denied.",
    danger: true,
  }, (sh, rest, lines) => {
    const a = rest.trim().toLowerCase();
    if (a === "/?") { showUsage(lines, COMMANDS.bcdedit); return true; }
    if (a && !a.startsWith("/enum")) { warn(lines, msg("bcdedit_change")); return 1; }
    const L = (s) => out(lines, s);
    L(""); L("Windows Boot Manager"); L("--------------------"); L("identifier              {bootmgr}");
    L("device                  partition=\\Device\\HarddiskVolume1"); L("path                    \\EFI\\Microsoft\\Boot\\bootmgfw.efi");
    L("description             Windows Boot Manager"); L("default                 {current}"); L("timeout                 30"); L("");
    L("Windows Boot Loader"); L("-------------------"); L("identifier              {current}"); L("device                  partition=C:");
    L("path                    \\Windows\\system32\\winload.efi"); L("description             Windows 11"); L("osdevice                partition=C:");
    L("systemroot              \\Windows"); L("recoverysequence        {7d3c9b21-0f6e-11ef-9a71-c8b29b1e5d01}");
    return true;
  });
})();
