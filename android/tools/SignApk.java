package com.lyrascore.tools;

import com.android.apksig.ApkSigner;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

public class SignApk {
    public static void main(String[] args) {
        try {
            if (args.length < 5) {
                System.err.println("Usage: java SignApk <inputApk> <outputApk> <keystore> <alias> <storepass>");
                System.exit(1);
            }
            File inApk = new File(args[0]);
            File outApk = new File(args[1]);
            File ksFile = new File(args[2]);
            String alias = args[3];
            char[] pass = args[4].toCharArray();

            KeyStore ks = KeyStore.getInstance("JKS");
            try (FileInputStream fis = new FileInputStream(ksFile)) {
                ks.load(fis, pass);
            }
            PrivateKey key = (PrivateKey) ks.getKey(alias, pass);
            X509Certificate cert = (X509Certificate) ks.getCertificate(alias);

            ApkSigner.SignerConfig config = new ApkSigner.SignerConfig.Builder(
                "CERT", key, Collections.singletonList(cert)
            ).build();

            ApkSigner signer = new ApkSigner.Builder(Collections.singletonList(config))
                .setInputApk(inApk)
                .setOutputApk(outApk)
                .setMinSdkVersion(21) // 设为 21 强制启用 v1 + v2 + v3 全部三代签名方案
                .setV1SigningEnabled(true)
                .setV2SigningEnabled(true)
                .setV3SigningEnabled(true)
                .build();

            signer.sign();
            System.out.println("[SignApk] Successfully signed (v1+v2+v3): " + outApk.getAbsolutePath());
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }
}