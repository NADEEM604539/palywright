import { chromium } from "playwright";

export async function GET() {

    const browser = await chromium.launch({
        headless: true,
        executablePath: chromium.executablePath()
    });

    try {

        const page = await browser.newPage();

        await page.goto(
            "https://qalam.nust.edu.pk/web/login",
            {
                waitUntil: "domcontentloaded"
            }
        );

        // Fill credentials

        await page.fill(
            "#login",
           "nmushtaq.bscs24seecs"
        );

        await page.fill(
            "#password",
            "Student@123"
        );

        // Submit

        await page.click(
            'button[type="submit"]'
        );

        // Wait until redirected

        await page.waitForLoadState(
            "domcontentloaded"
        );

        console.log(
            "Logged In URL:",
            page.url()
        );

        return Response.json({
            success: true,
            url: page.url()
        });

    } catch (err) {

        return Response.json({
            success: false,
            error: err.message
        });

    } finally {

        await browser.close();
    }
}
 