using System;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace ClaudioRadio
{
    internal sealed class DesktopLyricsPayload
    {
        public string title { get; set; }
        public string artist { get; set; }
        public string current { get; set; }
        public string translation { get; set; }
        public string next { get; set; }
        public bool playing { get; set; }
    }

    internal sealed class NowPayload
    {
        public bool playing { get; set; }
    }

    internal sealed class DesktopLyricsSettings
    {
        public int fontSize { get; set; }
        public int colorArgb { get; set; }
        public int translationColorArgb { get; set; }
        public bool locked { get; set; }
        public bool showControls { get; set; }
    }

    internal sealed class LyricsForm : Form
    {
        private const string ApiRoot = "http://localhost:3000";
        private const int WM_NCHITTEST = 0x0084;
        private const int HTTRANSPARENT = -1;
        private const int VK_RBUTTON = 0x02;
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
        private readonly Color transparent = Color.FromArgb(1, 2, 3);
        private readonly Label shadow1;
        private readonly Label shadow2;
        private readonly Label current;
        private readonly Label translationShadow;
        private readonly Label translation;
        private readonly Label next;
        private readonly Label prevButton;
        private readonly Label playButton;
        private readonly Label nextButton;
        private readonly System.Windows.Forms.Timer timer;
        private readonly ContextMenuStrip menu;
        private readonly NotifyIcon trayIcon;
        private DesktopLyricsSettings settings;
        private string lastKey = "";
        private bool dragging;
        private Point dragOffset;
        private bool keepMenuOpenOnce;
        private bool resetKeepMenuOpenQueued;
        private string lastCommand = "";
        private readonly string lyricFontFamily;

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        internal static string AppDataDir()
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Claudio AI Radio Desktop"
            );
            Directory.CreateDirectory(dir);
            return dir;
        }

        internal static void LogException(string area, Exception ex)
        {
            try
            {
                File.AppendAllText(
                    Path.Combine(AppDataDir(), "desktop-lyrics-crash.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " [" + area + "] " + ex + Environment.NewLine,
                    Encoding.UTF8
                );
            }
            catch
            {
            }
        }

        private bool ShouldClickThrough()
        {
            if (settings == null || !settings.locked) return false;
            return (GetAsyncKeyState(VK_RBUTTON) & 0x8000) == 0;
        }

        private sealed class PassthroughLabel : Label
        {
            public Func<bool> ShouldPassThrough { get; set; }

            protected override void WndProc(ref Message m)
            {
                try
                {
                    if (m.Msg == WM_NCHITTEST && ShouldPassThrough != null && ShouldPassThrough())
                    {
                        m.Result = new IntPtr(HTTRANSPARENT);
                        return;
                    }
                    base.WndProc(ref m);
                }
                catch (Exception ex)
                {
                    LogException("label-wndproc", ex);
                }
            }
        }

        public LyricsForm()
        {
            Text = "Claudio Lyrics";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            ShowInTaskbar = false;
            TopMost = true;
            BackColor = transparent;
            TransparencyKey = transparent;
            settings = LoadSettings();
            lyricFontFamily = ResolveLyricFontFamily();
            Height = settings.showControls ? Math.Max(180, settings.fontSize * 4 + 62) : Math.Max(136, settings.fontSize * 3 + 48);
            DoubleBuffered = true;

            Rectangle screen = Screen.PrimaryScreen.WorkingArea;
            Width = Math.Max(820, Math.Min(screen.Width - 24, Math.Max(settings.fontSize * 34, (int)(screen.Width * 0.88))));
            Left = Math.Max(0, (screen.Width - Width) / 2);
            Top = Math.Max(0, screen.Height - Height - 190);

            shadow1 = NewLyricLabel(30, FontStyle.Bold, Color.FromArgb(150, 0, 0, 0));
            shadow2 = NewLyricLabel(30, FontStyle.Bold, Color.FromArgb(105, 0, 0, 0));
            current = NewLyricLabel(30, FontStyle.Bold, Color.FromArgb(255, 248, 241, 228));
            translationShadow = NewLyricLabel(13, FontStyle.Regular, Color.FromArgb(190, 0, 0, 0));
            translation = NewLyricLabel(13, FontStyle.Regular, Color.FromArgb(220, 248, 241, 228));
            next = NewLyricLabel(11, FontStyle.Regular, Color.FromArgb(155, 248, 241, 228));
            prevButton = NewControlButton("<");
            playButton = NewControlButton("II");
            nextButton = NewControlButton(">");
            menu = BuildContextMenu();
            ContextMenuStrip = menu;
            trayIcon = new NotifyIcon();
            trayIcon.Icon = SystemIcons.Application;
            trayIcon.Text = "Claudio Desktop Lyrics";
            trayIcon.ContextMenuStrip = menu;
            trayIcon.Visible = true;

            Controls.AddRange(new Control[] {
                shadow1, shadow2, current, translationShadow, translation, next,
                prevButton, playButton, nextButton
            });
            ApplyLayerOrder();
            current.Text = "正在同步歌词";
            shadow1.Text = current.Text;
            shadow2.Text = current.Text;
            translation.Text = "";
            translationShadow.Text = "";

            prevButton.Click += delegate { InvokeGet("/api/previous"); };
            playButton.Click += delegate { TogglePlaying(); };
            nextButton.Click += delegate { InvokeGet("/api/next"); };

            foreach (Control control in new Control[] { this, shadow1, shadow2, current, translationShadow, translation, next })
            {
                control.ContextMenuStrip = menu;
                control.MouseDown += StartDrag;
                control.MouseMove += DragMove;
                control.MouseUp += StopDrag;
            }

            Resize += delegate { LayoutLyrics(); };
            Shown += delegate {
                RestoreVisiblePosition();
                TopMost = false;
                TopMost = true;
                BringToFront();
                Activate();
                RefreshLyrics();
            };
            FormClosed += delegate {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            };
            ApplySettings(false);
            LayoutLyrics();

            timer = new System.Windows.Forms.Timer();
            timer.Interval = 120;
            timer.Tick += delegate { RefreshLyrics(); };
            timer.Start();
            RefreshLyrics();
        }

        private Label NewLyricLabel(float size, FontStyle style, Color color)
        {
            PassthroughLabel label = new PassthroughLabel();
            label.ShouldPassThrough = delegate { return settings != null && settings.locked; };
            label.AutoSize = false;
            label.TextAlign = ContentAlignment.MiddleCenter;
            label.BackColor = Color.Transparent;
            label.ForeColor = color;
            label.Font = new Font(lyricFontFamily, size, style, GraphicsUnit.Point);
            label.UseCompatibleTextRendering = true;
            label.AutoEllipsis = false;
            return label;
        }

        private static string ResolveLyricFontFamily()
        {
            foreach (string name in new string[] { "Yu Gothic UI", "Meiryo", "MS Gothic", "Microsoft YaHei UI", "Microsoft YaHei" })
            {
                try
                {
                    using (Font font = new Font(name, 12, FontStyle.Regular, GraphicsUnit.Point))
                    {
                        if (string.Equals(font.FontFamily.Name, name, StringComparison.OrdinalIgnoreCase)) return name;
                    }
                }
                catch
                {
                }
            }
            return "Microsoft Sans Serif";
        }

        private Label NewControlButton(string text)
        {
            Label button = NewLyricLabel(17, FontStyle.Bold, Color.FromArgb(220, 248, 241, 228));
            button.Text = text;
            button.Cursor = Cursors.Hand;
            button.MouseEnter += delegate { button.ForeColor = Color.White; };
            button.MouseLeave += delegate { button.ForeColor = Color.FromArgb(220, 248, 241, 228); };
            return button;
        }

        private static string SettingsPath()
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Claudio AI Radio Desktop"
            );
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "desktop-lyrics.json");
        }

        private static string CommandPath()
        {
            return Path.Combine(AppDataDir(), "desktop-lyrics-command.txt");
        }

        private DesktopLyricsSettings LoadSettings()
        {
            DesktopLyricsSettings defaults = new DesktopLyricsSettings
            {
                fontSize = 30,
                colorArgb = Color.FromArgb(255, 248, 241, 228).ToArgb(),
                translationColorArgb = Color.FromArgb(220, 248, 241, 228).ToArgb(),
                locked = false,
                showControls = false
            };
            try
            {
                string text = File.ReadAllText(SettingsPath(), Encoding.UTF8);
                DesktopLyricsSettings loaded = serializer.Deserialize<DesktopLyricsSettings>(text);
                if (loaded == null) return defaults;
                if (loaded.fontSize < 18 || loaded.fontSize > 64) loaded.fontSize = defaults.fontSize;
                if (loaded.colorArgb == 0) loaded.colorArgb = defaults.colorArgb;
                if (loaded.translationColorArgb == 0)
                {
                    Color lyricColor = Color.FromArgb(loaded.colorArgb);
                    loaded.translationColorArgb = Color.FromArgb(220, lyricColor.R, lyricColor.G, lyricColor.B).ToArgb();
                }
                return loaded;
            }
            catch
            {
                return defaults;
            }
        }

        private void SaveSettings()
        {
            try
            {
                File.WriteAllText(SettingsPath(), serializer.Serialize(settings), Encoding.UTF8);
            }
            catch (Exception ex)
            {
                LogException("refresh-lyrics", ex);
            }
        }

        private ContextMenuStrip BuildContextMenu()
        {
            ContextMenuStrip strip = new ContextMenuStrip();
            strip.Closing += KeepMenuOpenIfAdjusting;
            ToolStripMenuItem lockItem = new ToolStripMenuItem("锁定歌词");
            lockItem.CheckOnClick = true;
            lockItem.Checked = settings.locked;
            lockItem.Click += delegate {
                settings.locked = lockItem.Checked;
                ApplySettings(true);
            };

            ToolStripMenuItem controlsItem = new ToolStripMenuItem("显示底部控制栏");
            controlsItem.CheckOnClick = true;
            controlsItem.Checked = settings.showControls;
            controlsItem.Click += delegate {
                settings.showControls = controlsItem.Checked;
                ApplySettings(true);
            };

            ToolStripMenuItem sizeMenu = new ToolStripMenuItem("字号");
            sizeMenu.Name = "sizeMenu";
            ToolStripMenuItem currentSizeItem = new ToolStripMenuItem("");
            currentSizeItem.Name = "currentSizeItem";
            currentSizeItem.Checked = true;
            currentSizeItem.Click += delegate {
                KeepMenuOpen();
                RefreshMenuChecks();
            };
            sizeMenu.DropDownItems.Add(currentSizeItem);
            sizeMenu.DropDownItems.Add(new ToolStripSeparator());
            foreach (int size in new int[] { 24, 28, 30, 34, 38, 44, 52 })
            {
                ToolStripMenuItem item = new ToolStripMenuItem(size + " px");
                item.Tag = size;
                item.Checked = settings.fontSize == size;
                item.Click += delegate {
                    KeepMenuOpen();
                    settings.fontSize = size;
                    ApplySettings(true);
                    RefreshMenuChecks();
                };
                sizeMenu.DropDownItems.Add(item);
            }
            ToolStripMenuItem smaller = new ToolStripMenuItem("缩小");
            smaller.Click += delegate {
                KeepMenuOpen();
                settings.fontSize = Math.Max(18, settings.fontSize - 2);
                ApplySettings(true);
                RefreshMenuChecks();
            };
            ToolStripMenuItem larger = new ToolStripMenuItem("放大");
            larger.Click += delegate {
                KeepMenuOpen();
                settings.fontSize = Math.Min(64, settings.fontSize + 2);
                ApplySettings(true);
                RefreshMenuChecks();
            };
            sizeMenu.DropDownItems.Add(new ToolStripSeparator());
            sizeMenu.DropDownItems.Add(smaller);
            sizeMenu.DropDownItems.Add(larger);

            ToolStripMenuItem colorMenu = new ToolStripMenuItem("颜色");
            ToolStripMenuItem mainColorMenu = new ToolStripMenuItem("第一行颜色");
            ToolStripMenuItem translationColorMenu = new ToolStripMenuItem("第二行颜色");
            colorMenu.Name = "colorMenu";
            mainColorMenu.Name = "mainColorMenu";
            translationColorMenu.Name = "translationColorMenu";
            AddColorItems(mainColorMenu, delegate(Color color) {
                settings.colorArgb = color.ToArgb();
                ApplySettings(true);
            }, delegate { return Color.FromArgb(settings.colorArgb); });
            AddColorItems(translationColorMenu, delegate(Color color) {
                Color normalized = Color.FromArgb(220, color.R, color.G, color.B);
                settings.translationColorArgb = normalized.ToArgb();
                ApplySettings(true);
            }, delegate { return Color.FromArgb(settings.translationColorArgb); });
            colorMenu.DropDownItems.Add(mainColorMenu);
            colorMenu.DropDownItems.Add(translationColorMenu);
            sizeMenu.DropDown.Closing += KeepMenuOpenIfAdjusting;
            mainColorMenu.DropDown.Closing += KeepMenuOpenIfAdjusting;
            translationColorMenu.DropDown.Closing += KeepMenuOpenIfAdjusting;
            sizeMenu.DropDownOpening += delegate { RefreshMenuChecks(); };
            mainColorMenu.DropDownOpening += delegate { RefreshMenuChecks(); };
            translationColorMenu.DropDownOpening += delegate { RefreshMenuChecks(); };

            ToolStripMenuItem exitItem = new ToolStripMenuItem("关闭桌面歌词");
            exitItem.Click += delegate { Close(); };

            strip.Items.Add(lockItem);
            strip.Items.Add(controlsItem);
            strip.Items.Add(new ToolStripSeparator());
            strip.Items.Add(sizeMenu);
            strip.Items.Add(colorMenu);
            strip.Items.Add(new ToolStripSeparator());
            strip.Items.Add(exitItem);
            RefreshMenuChecks(strip.Items);
            return strip;
        }

        private void KeepMenuOpen()
        {
            keepMenuOpenOnce = true;
            resetKeepMenuOpenQueued = false;
        }

        private void KeepMenuOpenIfAdjusting(object sender, ToolStripDropDownClosingEventArgs e)
        {
            if (keepMenuOpenOnce && e.CloseReason == ToolStripDropDownCloseReason.ItemClicked)
            {
                e.Cancel = true;
                QueueKeepMenuOpenReset();
            }
        }

        private void QueueKeepMenuOpenReset()
        {
            if (resetKeepMenuOpenQueued) return;
            resetKeepMenuOpenQueued = true;
            BeginInvoke(new MethodInvoker(delegate {
                keepMenuOpenOnce = false;
                resetKeepMenuOpenQueued = false;
            }));
        }

        private void ApplyLayerOrder()
        {
            shadow1.SendToBack();
            shadow2.SendToBack();
            translationShadow.SendToBack();
            current.BringToFront();
            translation.BringToFront();
            next.BringToFront();
            prevButton.BringToFront();
            playButton.BringToFront();
            nextButton.BringToFront();
        }

        private static int RgbKey(Color color)
        {
            return Color.FromArgb(255, color.R, color.G, color.B).ToArgb();
        }

        private static string ColorCode(Color color)
        {
            return "#" + color.R.ToString("X2") + color.G.ToString("X2") + color.B.ToString("X2");
        }

        private void RefreshMenuChecks()
        {
            if (menu == null) return;
            RefreshMenuChecks(menu.Items);
        }

        private void RefreshMenuChecks(ToolStripItemCollection items)
        {
            foreach (ToolStripItem stripItem in items)
            {
                RefreshMenuChecks(stripItem as ToolStripMenuItem);
            }
        }

        private void RefreshMenuChecks(ToolStripMenuItem item)
        {
            if (item == null) return;
            if (item.Name == "sizeMenu") item.Text = "字号：" + settings.fontSize + " px";
            else if (item.Name == "currentSizeItem")
            {
                item.Text = "当前字号：" + settings.fontSize + " px";
                item.Checked = true;
            }
            else if (item.Name == "colorMenu") item.Text = "颜色";
            else if (item.Name == "mainColorMenu") item.Text = "第一行颜色：" + ColorCode(Color.FromArgb(settings.colorArgb));
            else if (item.Name == "translationColorMenu") item.Text = "第二行颜色：" + ColorCode(Color.FromArgb(settings.translationColorArgb));
            else if (item.Name == "currentMainColorItem")
            {
                Color color = Color.FromArgb(settings.colorArgb);
                item.Text = "当前颜色：" + ColorCode(color);
                item.BackColor = Color.FromArgb(255, color.R, color.G, color.B);
                item.Checked = true;
            }
            else if (item.Name == "currentTranslationColorItem")
            {
                Color color = Color.FromArgb(settings.translationColorArgb);
                item.Text = "当前颜色：" + ColorCode(color);
                item.BackColor = Color.FromArgb(255, color.R, color.G, color.B);
                item.Checked = true;
            }
            if (item.Tag is int)
            {
                int tag = (int)item.Tag;
                if (tag > 0) item.Checked = settings.fontSize == tag;
                else if (tag == -1) item.Checked = RgbKey(Color.FromArgb(settings.colorArgb)) == RgbKey(item.BackColor);
                else if (tag == -2) item.Checked = RgbKey(Color.FromArgb(settings.translationColorArgb)) == RgbKey(item.BackColor);
            }
            foreach (ToolStripItem child in item.DropDownItems)
            {
                RefreshMenuChecks(child as ToolStripMenuItem);
            }
        }

        private void AddColorItems(ToolStripMenuItem menuItem, Action<Color> applyColor, Func<Color> currentColor)
        {
            int tag = menuItem.Text.Contains("第一") ? -1 : -2;
            ToolStripMenuItem currentItem = new ToolStripMenuItem("");
            currentItem.Name = tag == -1 ? "currentMainColorItem" : "currentTranslationColorItem";
            currentItem.Checked = true;
            currentItem.Click += delegate {
                KeepMenuOpen();
                RefreshMenuChecks();
            };
            menuItem.DropDownItems.Add(currentItem);
            menuItem.DropDownItems.Add(new ToolStripSeparator());
            AddColorItem(menuItem, "暖白", Color.FromArgb(255, 248, 241, 228), applyColor, tag);
            AddColorItem(menuItem, "纯白", Color.White, applyColor, tag);
            AddColorItem(menuItem, "网易云红", Color.FromArgb(255, 255, 72, 86), applyColor, tag);
            AddColorItem(menuItem, "金色", Color.FromArgb(255, 255, 216, 130), applyColor, tag);
            AddColorItem(menuItem, "青色", Color.FromArgb(255, 139, 222, 255), applyColor, tag);
            ToolStripMenuItem customColor = new ToolStripMenuItem("自定义...");
            customColor.Click += delegate {
                KeepMenuOpen();
                using (ColorDialog dialog = new ColorDialog())
                {
                    dialog.Color = currentColor();
                    dialog.FullOpen = true;
                    if (dialog.ShowDialog(this) == DialogResult.OK)
                    {
                        applyColor(dialog.Color);
                        RefreshMenuChecks();
                    }
                }
            };
            menuItem.DropDownItems.Add(new ToolStripSeparator());
            menuItem.DropDownItems.Add(customColor);
        }

        private void AddColorItem(ToolStripMenuItem menuItem, string label, Color color, Action<Color> applyColor, int tag)
        {
            ToolStripMenuItem item = new ToolStripMenuItem(label);
            item.Tag = tag;
            item.BackColor = Color.FromArgb(255, color.R, color.G, color.B);
            item.Checked = RgbKey(currentColorFromSettings(tag)) == RgbKey(color);
            item.Click += delegate {
                KeepMenuOpen();
                applyColor(color);
                RefreshMenuChecks();
            };
            menuItem.DropDownItems.Add(item);
        }

        private Color currentColorFromSettings(int tag)
        {
            return tag == -1 ? Color.FromArgb(settings.colorArgb) : Color.FromArgb(settings.translationColorArgb);
        }

        private void ApplySettings(bool persist)
        {
            Color lyricColor = Color.FromArgb(settings.colorArgb);
            Color translationColor = Color.FromArgb(settings.translationColorArgb);
            current.ForeColor = lyricColor;
            translation.ForeColor = translationColor;
            next.ForeColor = Color.FromArgb(155, translationColor.R, translationColor.G, translationColor.B);
            ApplyLayerOrder();

            current.Font = new Font(lyricFontFamily, settings.fontSize, FontStyle.Bold, GraphicsUnit.Point);
            shadow1.Font = new Font(lyricFontFamily, settings.fontSize, FontStyle.Bold, GraphicsUnit.Point);
            shadow2.Font = new Font(lyricFontFamily, settings.fontSize, FontStyle.Bold, GraphicsUnit.Point);
            translation.Font = new Font(lyricFontFamily, Math.Max(11, settings.fontSize * 0.43f), FontStyle.Regular, GraphicsUnit.Point);
            translationShadow.Font = translation.Font;
            next.Font = new Font(lyricFontFamily, Math.Max(10, settings.fontSize * 0.36f), FontStyle.Regular, GraphicsUnit.Point);

            prevButton.Visible = settings.showControls;
            playButton.Visible = settings.showControls;
            nextButton.Visible = settings.showControls;
            Cursor = settings.locked ? Cursors.Default : Cursors.SizeAll;

            int nextHeight = settings.showControls ? Math.Max(180, settings.fontSize * 4 + 62) : Math.Max(136, settings.fontSize * 3 + 48);
            if (Height != nextHeight) Height = nextHeight;
            LayoutLyrics();
            if (persist) SaveSettings();
        }

        private void LayoutLyrics()
        {
            int pad = 22;
            int mainTop = 18;
            int mainHeight = Math.Max(54, (int)(settings.fontSize * 1.48f));
            int subTop = mainTop + mainHeight;
            int subHeight = Math.Max(24, (int)(settings.fontSize * 0.68f));
            int nextTop = subTop + subHeight + 2;
            int nextHeight = Math.Max(20, (int)(settings.fontSize * 0.58f));
            int buttonTop = nextTop + nextHeight + 8;
            int buttonSize = 34;
            int gap = 28;
            int buttonTotal = buttonSize * 3 + gap * 2;
            int buttonLeft = (ClientSize.Width - buttonTotal) / 2;

            shadow1.SetBounds(pad + 3, mainTop + 4, ClientSize.Width - pad * 2, mainHeight);
            shadow2.SetBounds(pad - 2, mainTop + 1, ClientSize.Width - pad * 2, mainHeight);
            current.SetBounds(pad, mainTop, ClientSize.Width - pad * 2, mainHeight);
            translationShadow.SetBounds(pad + 2, subTop + 2, ClientSize.Width - pad * 2, subHeight);
            translation.SetBounds(pad, subTop, ClientSize.Width - pad * 2, subHeight);
            next.SetBounds(pad, nextTop, ClientSize.Width - pad * 2, nextHeight);
            prevButton.SetBounds(buttonLeft, buttonTop, buttonSize, buttonSize);
            playButton.SetBounds(buttonLeft + buttonSize + gap, buttonTop, buttonSize, buttonSize);
            nextButton.SetBounds(buttonLeft + (buttonSize + gap) * 2, buttonTop, buttonSize, buttonSize);
        }

        private void RestoreVisiblePosition()
        {
            Rectangle screen = Screen.PrimaryScreen.WorkingArea;
            int targetWidth = Math.Max(820, Math.Min(screen.Width - 24, Math.Max(settings.fontSize * 34, (int)(screen.Width * 0.88))));
            if (Width != targetWidth) Width = targetWidth;
            if (Height < 136) Height = 136;
            Left = Math.Max(screen.Left, screen.Left + (screen.Width - Width) / 2);
            Top = Math.Max(screen.Top, screen.Bottom - Height - 190);
            LayoutLyrics();
        }

        private Font FitFont(Label label, string text, float desiredSize, FontStyle style)
        {
            float size = desiredSize;
            int maxWidth = Math.Max(40, label.Width - 8);
            using (Graphics graphics = CreateGraphics())
            {
                while (size > 6)
                {
                    using (Font candidate = new Font(lyricFontFamily, size, style, GraphicsUnit.Point))
                    {
                        SizeF measured = graphics.MeasureString(text, candidate, int.MaxValue, StringFormat.GenericTypographic);
                        if (measured.Width <= maxWidth) break;
                    }
                    size -= size > 28 ? 2 : 1;
                }
            }
            return new Font(lyricFontFamily, size, style, GraphicsUnit.Point);
        }

        private void ApplyTextFonts(string main, string sub, string nextLine)
        {
            Rectangle screen = Screen.PrimaryScreen.WorkingArea;
            int targetWidth = Math.Max(820, Math.Min(screen.Width - 24, Math.Max(settings.fontSize * 34, (int)(screen.Width * 0.88))));
            if (Width != targetWidth)
            {
                Width = targetWidth;
                Left = Math.Max(0, (screen.Width - Width) / 2);
                LayoutLyrics();
            }
            Font mainFont = FitFont(current, main, settings.fontSize, FontStyle.Bold);
            current.Font = mainFont;
            shadow1.Font = new Font(mainFont.FontFamily, mainFont.Size, FontStyle.Bold, GraphicsUnit.Point);
            shadow2.Font = new Font(mainFont.FontFamily, mainFont.Size, FontStyle.Bold, GraphicsUnit.Point);

            float subDesired = Math.Max(11, settings.fontSize * 0.43f);
            Font subFont = FitFont(translation, sub, subDesired, FontStyle.Regular);
            translation.Font = subFont;
            translationShadow.Font = new Font(subFont.FontFamily, subFont.Size, FontStyle.Regular, GraphicsUnit.Point);

            float nextDesired = Math.Max(10, settings.fontSize * 0.36f);
            next.Font = FitFont(next, nextLine, nextDesired, FontStyle.Regular);
        }

        private void StartDrag(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Right)
            {
                return;
            }
            if (e.Button == MouseButtons.Left && !settings.locked)
            {
                dragging = true;
                dragOffset = e.Location;
            }
        }

        private void DragMove(object sender, MouseEventArgs e)
        {
            if (!dragging) return;
            Point cursor = Cursor.Position;
            Location = new Point(cursor.X - dragOffset.X, cursor.Y - dragOffset.Y);
        }

        private void StopDrag(object sender, MouseEventArgs e)
        {
            dragging = false;
        }

        private void RefreshLyrics()
        {
            try
            {
                ProcessCommand();
                DesktopLyricsPayload payload = GetJson<DesktopLyricsPayload>("/api/desktop-lyrics");
                bool playing = payload != null && payload.playing;
                string key = (payload == null ? "" : payload.current + "\n" + payload.translation + "\n" + payload.next) + "\n" + playing;
                if (key == lastKey) return;
                lastKey = key;

                string main = payload == null || string.IsNullOrWhiteSpace(payload.current) ? "No lyrics" : payload.current;
                string sub = payload == null ? "" : payload.translation ?? "";
                string nextLine = payload == null ? "" : payload.next ?? "";
                ApplyTextFonts(main, sub, nextLine);
                shadow1.Text = main;
                shadow2.Text = main;
                current.Text = main;
                translationShadow.Text = sub;
                translation.Text = sub;
                next.Text = nextLine;
                playButton.Text = playing ? "II" : "P";
            }
            catch
            {
            }
        }

        private void ProcessCommand()
        {
            try
            {
                string path = CommandPath();
                if (!File.Exists(path)) return;
                string command = File.ReadAllText(path, Encoding.UTF8).Trim();
                if (string.IsNullOrWhiteSpace(command) || command == lastCommand) return;
                lastCommand = command;
                if (command.StartsWith("show:", StringComparison.OrdinalIgnoreCase))
                {
                    if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
                    Show();
                    RestoreVisiblePosition();
                    TopMost = false;
                    TopMost = true;
                    BringToFront();
                    Activate();
                }
            }
            catch
            {
            }
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_NCHITTEST && settings != null && settings.locked)
            {
                bool rightButtonDown = (GetAsyncKeyState(VK_RBUTTON) & 0x8000) != 0;
                if (!rightButtonDown)
                {
                    m.Result = new IntPtr(HTTRANSPARENT);
                    return;
                }
            }
            base.WndProc(ref m);
        }

        private T GetJson<T>(string path)
        {
            using (WebClient client = new WebClient())
            {
                client.Encoding = Encoding.UTF8;
                string json = client.DownloadString(ApiRoot + path);
                return serializer.Deserialize<T>(json);
            }
        }

        private void InvokeGet(string path)
        {
            try
            {
                using (WebClient client = new WebClient())
                {
                    client.DownloadString(ApiRoot + path);
                }
            }
            catch
            {
            }
        }

        private void TogglePlaying()
        {
            try
            {
                NowPayload now = GetJson<NowPayload>("/api/now");
                bool nextPlaying = !(now != null && now.playing);
                using (WebClient client = new WebClient())
                {
                    client.Encoding = Encoding.UTF8;
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    client.UploadString(ApiRoot + "/api/state", "{\"playing\":" + (nextPlaying ? "true" : "false") + "}");
                }
            }
            catch
            {
            }
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object sender, ThreadExceptionEventArgs e) {
                LyricsForm.LogException("thread-exception", e.Exception);
            };
            AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e) {
                Exception ex = e.ExceptionObject as Exception;
                LyricsForm.LogException("domain-exception", ex ?? new Exception(Convert.ToString(e.ExceptionObject)));
            };
            bool createdNew;
            using (Mutex mutex = new Mutex(true, "ClaudioDesktopLyricsOverlayExeV1", out createdNew))
            {
                if (!createdNew) return;
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new LyricsForm());
            }
        }
    }
}
