using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class ClaudioRadioLauncher
{
    [STAThread]
    private static int Main()
    {
        string exePath = Process.GetCurrentProcess().MainModule.FileName;
        string projectDir = Path.GetDirectoryName(exePath);
        string startScript = Path.Combine(projectDir, "start-radio.ps1");
        string secrets = Path.Combine(projectDir, "radio-secrets.ps1");
        string secretsExample = Path.Combine(projectDir, "radio-secrets.example.ps1");

        if (!File.Exists(startScript))
        {
            MessageBox.Show("start-radio.ps1 was not found. Put ClaudioRadioLauncher.exe in the project root.", "Claudio AI Radio");
            return 1;
        }

        if (!File.Exists(secrets))
        {
            if (File.Exists(secretsExample))
            {
                File.Copy(secretsExample, secrets, false);
            }
            MessageBox.Show("radio-secrets.ps1 is missing. A template has been created. Fill in NETEASE_COOKIE and optional AI keys, then run the launcher again.", "Claudio AI Radio");
            Process.Start(new ProcessStartInfo(projectDir) { UseShellExecute = true });
            return 1;
        }

        try
        {
            var server = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + startScript + "\"",
                WorkingDirectory = projectDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            Process.Start(server);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Failed to start PowerShell: " + ex.Message, "Claudio AI Radio");
            return 1;
        }

        for (int i = 0; i < 30; i++)
        {
            if (IsServerReady())
            {
                Process.Start(new ProcessStartInfo("http://localhost:3000/") { UseShellExecute = true });
                return 0;
            }
            Thread.Sleep(1000);
        }

        Process.Start(new ProcessStartInfo("http://localhost:3000/") { UseShellExecute = true });
        return 0;
    }

    private static bool IsServerReady()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create("http://localhost:3000/api/health");
            request.Timeout = 800;
            using (var response = (HttpWebResponse)request.GetResponse())
            {
                return response.StatusCode == HttpStatusCode.OK;
            }
        }
        catch
        {
            return false;
        }
    }
}
