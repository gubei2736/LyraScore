package com.lyrascore.tools;

import com.android.apksig.ApkVerifier;
import java.io.File;

public class VerifyApk {
    public static void main(String[] args) {
        try {
            if (args.length < 1) {
                System.err.println("Usage: java VerifyApk <apkFile>");
                System.exit(1);
            }
            File apk = new File(args[0]);
            ApkVerifier verifier = new ApkVerifier.Builder(apk).build();
            ApkVerifier.Result result = verifier.verify();
            System.out.println("[VerifyApk] Verified: " + result.isVerified());
            System.out.println("[VerifyApk] Scheme v1: " + result.isVerifiedUsingV1Scheme());
            System.out.println("[VerifyApk] Scheme v2: " + result.isVerifiedUsingV2Scheme());
            System.out.println("[VerifyApk] Scheme v3: " + result.isVerifiedUsingV3Scheme());
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }
}
