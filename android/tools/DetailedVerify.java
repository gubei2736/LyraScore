import com.android.apksig.ApkVerifier;
import java.io.File;

public class DetailedVerify {
    public static void main(String[] args) throws Exception {
        File apk = new File(args[0]);
        ApkVerifier verifier = new ApkVerifier.Builder(apk).build();
        ApkVerifier.Result result = verifier.verify();
        System.out.println("Verified: " + result.isVerified());
        System.out.println("v1 Scheme: " + result.isVerifiedUsingV1Scheme());
        System.out.println("v2 Scheme: " + result.isVerifiedUsingV2Scheme());
        System.out.println("v3 Scheme: " + result.isVerifiedUsingV3Scheme());
        System.out.println("Errors: " + result.getErrors());
        System.out.println("Warnings: " + result.getWarnings());
        for (ApkVerifier.Result.V1SchemeSignerInfo s : result.getV1SchemeSigners()) {
            System.out.println("v1 signer errors: " + s.getErrors());
            System.out.println("v1 signer warnings: " + s.getWarnings());
        }
        for (ApkVerifier.Result.V2SchemeSignerInfo s : result.getV2SchemeSigners()) {
            System.out.println("v2 signer errors: " + s.getErrors());
            System.out.println("v2 signer warnings: " + s.getWarnings());
        }
    }
}