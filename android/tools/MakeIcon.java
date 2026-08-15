import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

public class MakeIcon {
    public static void main(String[] args) throws Exception {
        int size = 192;
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // 背景圆角矩形
        GradientPaint gp = new GradientPaint(0, 0, new Color(79, 70, 229), size, size, new Color(147, 51, 234));
        g.setPaint(gp);
        g.fillRoundRect(8, 8, size - 16, size - 16, 48, 48);

        // 白色字母 L
        g.setColor(Color.WHITE);
        g.setFont(new Font("SansSerif", Font.BOLD, 110));
        FontMetrics fm = g.getFontMetrics();
        String text = "L";
        int x = (size - fm.stringWidth(text)) / 2;
        int y = (size - fm.getHeight()) / 2 + fm.getAscent() - 2;
        g.drawString(text, x, y);

        g.dispose();
        File out = new File(args[0]);
        out.getParentFile().mkdirs();
        ImageIO.write(img, "PNG", out);
        System.out.println("Icon generated: " + out.getAbsolutePath());
    }
}