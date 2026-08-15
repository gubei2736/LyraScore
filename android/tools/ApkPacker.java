package com.lyrascore.tools;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.*;
import java.util.zip.*;

public class ApkPacker {
    private static final int ALIGNMENT = 4;

    public static void main(String[] args) {
        if (args.length < 3) {
            System.err.println("Usage: java ApkPacker <resourcesApk> <classesDex> <assetsDistDir> <outputUnalignedApk>");
            System.exit(1);
        }
        try {
            File resApk = new File(args[0]);
            File classesDex = new File(args[1]);
            File assetsDir = new File(args[2]);
            File outApk = new File(args[3]);

            pack(resApk, classesDex, assetsDir, outApk);
            System.out.println("[ApkPacker] Successfully assembled standard APK: " + outApk.getAbsolutePath());
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    public static void pack(File resApk, File classesDex, File assetsDir, File outApk) throws Exception {
        if (outApk.exists()) outApk.delete();
        outApk.getParentFile().mkdirs();

        List<EntryItem> items = new ArrayList<>();

        // 1. 从 aapt2 生成的 resources.apk 中提取 AndroidManifest.xml, resources.arsc, res/**
        try (ZipFile zip = new ZipFile(resApk)) {
            Enumeration<? extends ZipEntry> en = zip.entries();
            while (en.hasMoreElements()) {
                ZipEntry entry = en.nextElement();
                String name = entry.getName().replace("\\", "/");
                byte[] data;
                try (InputStream is = zip.getInputStream(entry)) {
                    data = readAll(is);
                }
                // resources.arsc 和 png 必须是 STORED（未压缩）
                boolean stored = name.equals("resources.arsc") || name.endsWith(".png") || name.endsWith(".jpg");
                items.add(new EntryItem(name, data, stored));
            }
        }

        // 2. 加入 classes.dex (STORED 保证快速加载与 4-byte 对齐)
        if (classesDex.exists()) {
            byte[] dexData = readAll(new FileInputStream(classesDex));
            items.add(new EntryItem("classes.dex", dexData, true));
        }

        // 3. 加入 assets/dist 下的所有 Web 静态资产
        addAssets(assetsDir, "assets/dist", items);

        // 4. 组装并写入符合 Android 规范的 4-byte 对齐 ZIP
        writeAlignedZip(items, outApk);
    }

    private static void addAssets(File dir, String prefix, List<EntryItem> items) throws Exception {
        if (!dir.exists()) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isDirectory()) {
                addAssets(f, prefix + "/" + f.getName(), items);
            } else {
                String entryName = prefix + "/" + f.getName();
                byte[] data = readAll(new FileInputStream(f));
                // Web 资产 (HTML, JS, CSS, fonts) 使用 STORED 保留原始大小，保证 WebView 极速流式读取
                items.add(new EntryItem(entryName, data, true));
            }
        }
    }

    private static void writeAlignedZip(List<EntryItem> items, File outApk) throws Exception {
        try (FileOutputStream fos = new FileOutputStream(outApk);
             BufferedOutputStream bos = new BufferedOutputStream(fos)) {

            List<WrittenRecord> written = new ArrayList<>();
            long currentOffset = 0;

            for (EntryItem item : items) {
                byte[] nameBytes = item.name.getBytes("UTF-8");
                byte[] data = item.data;
                CRC32 crc = new CRC32();
                crc.update(data);
                long crcVal = crc.getValue();

                int method = item.stored ? ZipEntry.STORED : ZipEntry.DEFLATED;
                byte[] compressedData = data;
                int compressedSize = data.length;

                if (!item.stored) {
                    ByteArrayOutputStream deflatedOut = new ByteArrayOutputStream();
                    Deflater deflater = new Deflater(Deflater.BEST_COMPRESSION, true);
                    DeflaterOutputStream dos = new DeflaterOutputStream(deflatedOut, deflater);
                    dos.write(data);
                    dos.finish();
                    compressedData = deflatedOut.toByteArray();
                    compressedSize = compressedData.length;
                }

                // 4 字节对齐计算 (仅对 STORED 条目)
                int padding = 0;
                if (item.stored) {
                    long dataOffset = currentOffset + 30 + nameBytes.length;
                    int mod = (int) (dataOffset % ALIGNMENT);
                    if (mod != 0) {
                        padding = ALIGNMENT - mod;
                    }
                }
                byte[] extra = new byte[padding];

                // Local File Header
                byte[] lfh = createLocalHeader(item.name, nameBytes, extra, method, crcVal, compressedSize, data.length);
                bos.write(lfh);
                currentOffset += lfh.length;

                // Data
                bos.write(compressedData);
                long lfhOffset = currentOffset - lfh.length;
                currentOffset += compressedData.length;

                written.add(new WrittenRecord(item.name, nameBytes, extra, method, crcVal, compressedSize, data.length, lfhOffset));
            }

            // Central Directory
            long cdOffset = currentOffset;
            for (WrittenRecord rec : written) {
                byte[] cdh = createCentralDirHeader(rec);
                bos.write(cdh);
                currentOffset += cdh.length;
            }
            long cdSize = currentOffset - cdOffset;

            // End of Central Directory
            byte[] eocd = createEOCD(written.size(), cdSize, cdOffset);
            bos.write(eocd);
            bos.flush();
        }
    }

    private static byte[] createLocalHeader(String name, byte[] nameBytes, byte[] extra, int method, long crc, int compSize, int uncompSize) {
        ByteBuffer buf = ByteBuffer.allocate(30 + nameBytes.length + extra.length).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(0x04034b50); // LFH signature
        buf.putShort((short) 20); // Version needed (2.0)
        buf.putShort((short) 0);  // Flags
        buf.putShort((short) method);
        buf.putShort((short) 0);  // Time
        buf.putShort((short) 0);  // Date
        buf.putInt((int) crc);
        buf.putInt(compSize);
        buf.putInt(uncompSize);
        buf.putShort((short) nameBytes.length);
        buf.putShort((short) extra.length);
        buf.put(nameBytes);
        buf.put(extra);
        return buf.array();
    }

    private static byte[] createCentralDirHeader(WrittenRecord rec) {
        ByteBuffer buf = ByteBuffer.allocate(46 + rec.nameBytes.length + rec.extra.length).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(0x02014b50); // CDH signature
        buf.putShort((short) 20); // Version made by
        buf.putShort((short) 20); // Version needed
        buf.putShort((short) 0);  // Flags
        buf.putShort((short) rec.method);
        buf.putShort((short) 0);  // Time
        buf.putShort((short) 0);  // Date
        buf.putInt((int) rec.crc);
        buf.putInt(rec.compSize);
        buf.putInt(rec.uncompSize);
        buf.putShort((short) rec.nameBytes.length);
        buf.putShort((short) rec.extra.length);
        buf.putShort((short) 0);  // Comment length
        buf.putShort((short) 0);  // Disk start
        buf.putShort((short) 0);  // Internal attrs
        buf.putInt(0);           // External attrs
        buf.putInt((int) rec.lfhOffset);
        buf.put(rec.nameBytes);
        buf.put(rec.extra);
        return buf.array();
    }

    private static byte[] createEOCD(int count, long cdSize, long cdOffset) {
        ByteBuffer buf = ByteBuffer.allocate(22).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(0x06054b50); // EOCD signature
        buf.putShort((short) 0); // Disk
        buf.putShort((short) 0); // CD disk
        buf.putShort((short) count);
        buf.putShort((short) count);
        buf.putInt((int) cdSize);
        buf.putInt((int) cdOffset);
        buf.putShort((short) 0);
        return buf.array();
    }

    private static byte[] readAll(InputStream is) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int len;
        while ((len = is.read(buf)) != -1) baos.write(buf, 0, len);
        return baos.toByteArray();
    }

    private static class EntryItem {
        String name;
        byte[] data;
        boolean stored;
        EntryItem(String name, byte[] data, boolean stored) {
            this.name = name;
            this.data = data;
            this.stored = stored;
        }
    }

    private static class WrittenRecord {
        String name;
        byte[] nameBytes;
        byte[] extra;
        int method;
        long crc;
        int compSize;
        int uncompSize;
        long lfhOffset;
        WrittenRecord(String name, byte[] nameBytes, byte[] extra, int method, long crc, int compSize, int uncompSize, long lfhOffset) {
            this.name = name;
            this.nameBytes = nameBytes;
            this.extra = extra;
            this.method = method;
            this.crc = crc;
            this.compSize = compSize;
            this.uncompSize = uncompSize;
            this.lfhOffset = lfhOffset;
        }
    }
}
