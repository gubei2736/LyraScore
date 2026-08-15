package com.lyrascore.tools;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.*;
import java.util.zip.*;

public class ZipAligner {
    private static final int ALIGNMENT = 4;

    public static void main(String[] args) {
        if (args.length < 2) {
            System.err.println("Usage: java ZipAligner <inZip> <outAlignedZip>");
            System.exit(1);
        }
        try {
            align(new File(args[0]), new File(args[1]));
            System.out.println("[ZipAligner] Successfully aligned: " + args[1]);
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    public static void align(File inZip, File outZip) throws IOException {
        try (ZipFile zipFile = new ZipFile(inZip);
             FileOutputStream fos = new FileOutputStream(outZip);
             BufferedOutputStream bos = new BufferedOutputStream(fos)) {

            List<ZipEntry> entries = new ArrayList<>();
            Enumeration<? extends ZipEntry> en = zipFile.entries();
            while (en.hasMoreElements()) {
                entries.add(en.nextElement());
            }

            // 构造输出 ZIP
            List<EntryRecord> records = new ArrayList<>();
            long currentOffset = 0;

            for (ZipEntry entry : entries) {
                byte[] nameBytes = entry.getName().getBytes("UTF-8");
                byte[] extra = entry.getExtra();
                if (extra == null) extra = new byte[0];

                int method = entry.getMethod();
                int padding = 0;

                // STORED 条目需要 4 字节对齐
                if (method == ZipEntry.STORED) {
                    long dataOffset = currentOffset + 30 + nameBytes.length + extra.length;
                    int mod = (int) (dataOffset % ALIGNMENT);
                    if (mod != 0) {
                        padding = ALIGNMENT - mod;
                    }
                }

                byte[] newExtra = new byte[extra.length + padding];
                System.arraycopy(extra, 0, newExtra, 0, extra.length);

                // 写入 Local File Header
                byte[] lfh = createLocalFileHeader(entry, nameBytes, newExtra);
                bos.write(lfh);
                currentOffset += lfh.length;

                // 写入 Data
                try (InputStream is = zipFile.getInputStream(entry)) {
                    byte[] buf = new byte[8192];
                    int len;
                    while ((len = is.read(buf)) != -1) {
                        bos.write(buf, 0, len);
                        currentOffset += len;
                    }
                }

                records.add(new EntryRecord(entry, nameBytes, newExtra, currentOffset - (entry.getCompressedSize() == -1 ? entry.getSize() : entry.getCompressedSize()) - lfh.length));
            }

            // 写入 Central Directory
            long cdOffset = currentOffset;
            for (EntryRecord rec : records) {
                byte[] cdh = createCentralDirHeader(rec.entry, rec.nameBytes, rec.extra, rec.lfhOffset);
                bos.write(cdh);
                currentOffset += cdh.length;
            }
            long cdSize = currentOffset - cdOffset;

            // 写入 End of Central Directory
            byte[] eocd = createEOCD(records.size(), cdSize, cdOffset);
            bos.write(eocd);
            bos.flush();
        }
    }

    private static byte[] createLocalFileHeader(ZipEntry entry, byte[] nameBytes, byte[] extra) {
        ByteBuffer buf = ByteBuffer.allocate(30 + nameBytes.length + extra.length).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(0x04034b50); // Signature
        buf.putShort((short) 20); // Version needed
        buf.putShort((short) 0);  // General flags
        buf.putShort((short) entry.getMethod());
        buf.putInt((int) entry.getTime());
        buf.putInt((int) entry.getCrc());
        buf.putInt((int) (entry.getCompressedSize() == -1 ? entry.getSize() : entry.getCompressedSize()));
        buf.putInt((int) entry.getSize());
        buf.putShort((short) nameBytes.length);
        buf.putShort((short) extra.length);
        buf.put(nameBytes);
        buf.put(extra);
        return buf.array();
    }

    private static byte[] createCentralDirHeader(ZipEntry entry, byte[] nameBytes, byte[] extra, long lfhOffset) {
        ByteBuffer buf = ByteBuffer.allocate(46 + nameBytes.length + extra.length).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(0x02014b50); // Signature
        buf.putShort((short) 20); // Version made by
        buf.putShort((short) 20); // Version needed
        buf.putShort((short) 0);  // Flags
        buf.putShort((short) entry.getMethod());
        buf.putInt((int) entry.getTime());
        buf.putInt((int) entry.getCrc());
        buf.putInt((int) (entry.getCompressedSize() == -1 ? entry.getSize() : entry.getCompressedSize()));
        buf.putInt((int) entry.getSize());
        buf.putShort((short) nameBytes.length);
        buf.putShort((short) extra.length);
        buf.putShort((short) 0);  // Comment length
        buf.putShort((short) 0);  // Disk number start
        buf.putShort((short) 0);  // Internal attributes
        buf.putInt(0);           // External attributes
        buf.putInt((int) lfhOffset);
        buf.put(nameBytes);
        buf.put(extra);
        return buf.array();
    }

    private static byte[] createEOCD(int entryCount, long cdSize, long cdOffset) {
        ByteBuffer buf = ByteBuffer.allocate(22).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(0x06054b50); // Signature
        buf.putShort((short) 0); // Disk number
        buf.putShort((short) 0); // CD start disk
        buf.putShort((short) entryCount);
        buf.putShort((short) entryCount);
        buf.putInt((int) cdSize);
        buf.putInt((int) cdOffset);
        buf.putShort((short) 0); // Comment len
        return buf.array();
    }

    private static class EntryRecord {
        ZipEntry entry;
        byte[] nameBytes;
        byte[] extra;
        long lfhOffset;

        EntryRecord(ZipEntry entry, byte[] nameBytes, byte[] extra, long lfhOffset) {
            this.entry = entry;
            this.nameBytes = nameBytes;
            this.extra = extra;
            this.lfhOffset = lfhOffset;
        }
    }
}
