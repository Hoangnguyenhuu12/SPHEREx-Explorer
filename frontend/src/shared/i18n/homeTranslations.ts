import type { Language } from './language'

export type NavKey = 'home' | 'story' | 'entry' | 'explorer' | 'forum'

export interface ShellCopy {
  skipToContent: string
  openNav: string
  closeNav: string
  pagesLabel: string
  accountLabel: string
  footerLabel: string
  openTheEyes: string
  login: string
  signup: string
  myPosts: string
  logout: string
  footerLine: string
  footerCredit: string
  nav: Record<NavKey, string>
}

export interface HomeCopy {
  eyebrow: string
  heroTitle: string
  heroSlogan: string
  heroLead: string
  watchBrownDwarf: string
  exploreSky: string
  readStory: string
  howItWorksTitle: string
  howItWorksLead: string
  howItWorksHint: string
  steps: readonly { title: string; body: string }[]
  aboutTitle: string
  aboutLead: (teamName: string) => string
  aboutDisclaimer: string
  teamMembersLabel: string
  teamRoles: Record<string, string>
  ctaTitle: string
  ctaBody: string
}

export const SHELL_COPY: Record<Language, ShellCopy> = {
  en: {
    skipToContent: 'Skip to content',
    openNav: 'Open navigation',
    closeNav: 'Close navigation',
    pagesLabel: 'Pages',
    accountLabel: 'Account',
    footerLabel: 'Footer',
    openTheEyes: 'Open The Eyes',
    login: 'Log in',
    signup: 'Sign up',
    myPosts: 'My posts',
    logout: 'Log out',
    footerLine: 'Independent project using NASA SPHEREx data.',
    footerCredit:
      'Not affiliated with or endorsed by NASA. Earth imagery: NASA Blue Marble. Sky map in The Eyes: SPHEREx DR1 all-sky cube via IRSA (DSS2 via CDS as fallback) Aladin Lite.',
    nav: {
      home: 'Home',
      story: 'Story',
      entry: 'SPHEREx Orbit',
      explorer: 'The Eyes',
      forum: 'Forum',
    },
  },
  vi: {
    skipToContent: 'Chuyển đến nội dung chính',
    openNav: 'Mở điều hướng',
    closeNav: 'Đóng điều hướng',
    pagesLabel: 'Các trang',
    accountLabel: 'Tài khoản',
    footerLabel: 'Liên kết chân trang',
    openTheEyes: 'Mở Đôi mắt',
    login: 'Đăng nhập',
    signup: 'Đăng ký',
    myPosts: 'Bài viết của mình',
    logout: 'Đăng xuất',
    footerLine: 'Dự án độc lập sử dụng dữ liệu NASA SPHEREx.',
    footerCredit:
      'Không trực thuộc và không được bảo trợ bởi NASA. Ảnh Trái Đất: NASA Blue Marble. Bản đồ bầu trời trong Đôi mắt: khối dữ liệu toàn bầu trời SPHEREx DR1 qua IRSA (dự phòng DSS2 qua CDS) trên Aladin Lite.',
    nav: {
      home: 'Trang chủ',
      story: 'Câu chuyện',
      entry: 'Quỹ đạo SPHEREx',
      explorer: 'Đôi mắt',
      forum: 'Diễn đàn',
    },
  },
}

export const HOME_COPY: Record<Language, HomeCopy> = {
  en: {
    eyebrow: 'NASA SPHEREx · NASA Space Apps 2026',
    heroTitle: 'The eyes of the galaxy',
    heroSlogan: 'Every six months, SPHEREx photographs the whole sky. See what changed.',
    heroLead:
      'Pick a star, press play, and watch NASA’s infrared survey catch it drifting across the sky or pulsing in brightness. No data files, no code.',
    watchBrownDwarf: 'Watch a brown dwarf move',
    exploreSky: 'Explore the sky',
    readStory: 'Read the story',
    howItWorksTitle: 'How it works',
    howItWorksLead: 'Four steps from a point in the sky to a change you can see.',
    howItWorksHint: 'Point at a step to read it.',
    steps: [
      { title: 'Choose a target', body: 'Pick one of five featured stars, search a name, or type any RA and Dec.' },
      {
        title: 'Pick an infrared channel',
        body: 'SPHEREx has six detectors, from 0.75 to 5 micrometres. Colder objects show up at longer wavelengths.',
      },
      {
        title: 'Step through the dates',
        body: 'SPHEREx scans the whole sky about every six months. Play the observations like a short film.',
      },
      {
        title: 'Spot what changed',
        body: 'Compare two dates side by side or flip A/B. A bright-and-dark pair in Difference is a clue to check against the original images.',
      },
    ],
    aboutTitle: 'About us',
    aboutLead: (teamName: string) =>
      `We are team ${teamName}, a team of six building an independent tool for the NASA Space Apps 2026 SPHEREx Sky Viewer challenge. Astronomy archives are public but hard to read: FITS files, coordinate systems and query languages stand between curious people and the sky. We want anyone to be able to open a page and watch a star move.`,
    aboutDisclaimer:
      'SPHEREx Explorer is not an official NASA product. It uses public data released by NASA through the Infrared Science Archive.',
    teamMembersLabel: 'Team members',
    teamRoles: {
      'Thạch': 'Interface design and coordination',
      'Duy Hoàng': 'Frontend, deployment and testing',
      'Đông': 'Backend API and caching',
      'Khôi': 'NASA archive data (IRSA) and database',
      'Hữu Hoàng': 'Image processing',
      'Nguyên': 'Science and validation',
    },
    ctaTitle: 'See the sky move',
    ctaBody: 'Jump straight into the WISE 0855 brown dwarf comparison, or start from Earth and roam the whole infrared sky.',
  },
  vi: {
    eyebrow: 'NASA SPHEREx · NASA Space Apps 2026',
    heroTitle: 'Đôi mắt của cả\u00A0thiên\u00A0hà',
    heroSlogan: 'Cứ mỗi sáu tháng, SPHEREx lại chụp ảnh toàn bộ bầu\u00A0trời. Hãy xem điều gì đã thay đổi.',
    heroLead:
      'Chọn một ngôi sao, bấm chạy và ngắm dữ liệu hồng ngoại của NASA ghi lại cảnh nó trôi ngang bầu trời hay thay đổi độ sáng theo từng nhịp — không cần file dữ liệu, chẳng cần viết code.',
    watchBrownDwarf: 'Xem sao lùn nâu di chuyển',
    exploreSky: 'Khám phá bầu trời',
    readStory: 'Đọc câu chuyện',
    howItWorksTitle: 'Cách hoạt động',
    howItWorksLead: 'Chỉ bốn bước từ một điểm trên bầu trời đến những thay đổi thấy rõ bằng mắt thường.',
    howItWorksHint: 'Di chuột vào từng bước để xem chi tiết.',
    steps: [
      { title: 'Chọn mục tiêu', body: 'Chọn một trong năm ngôi sao gợi ý, tìm theo tên, hoặc nhập bất kỳ tọa độ RA và Dec nào.' },
      {
        title: 'Chọn kênh hồng ngoại',
        body: 'SPHEREx có sáu cảm biến trải từ 0,75 đến 5 micromét. Các thiên thể càng lạnh càng hiện rõ ở bước sóng dài.',
      },
      {
        title: 'Lướt qua các mốc ngày',
        body: 'SPHEREx quét toàn bộ bầu trời mỗi sáu tháng một lần. Hãy phát chuỗi ảnh quan sát như xem một thước phim ngắn.',
      },
      {
        title: 'Nhận ra điểm thay đổi',
        body: 'Đặt hai mốc ngày cạnh nhau để so sánh hoặc lật nhanh A/B. Nếu thấy một cặp đốm sáng–tối ở chế độ Difference, hãy đối chiếu lại với ảnh gốc.',
      },
    ],
    aboutTitle: 'Về chúng mình',
    aboutLead: (teamName: string) =>
      `Chúng mình là đội ${teamName} — nhóm sáu thành viên cùng xây dựng một công cụ độc lập cho thử thách NASA Space Apps 2026 SPHEREx Sky Viewer. Dữ liệu thiên văn tuy mở nhưng khá khó đọc: tệp FITS, hệ tọa độ hay câu lệnh truy vấn vô tình tạo ra khoảng cách giữa người yêu thích khám phá và bầu trời. Chúng mình muốn ai cũng có thể mở trình duyệt lên và tận mắt thấy một ngôi sao đang di chuyển.`,
    aboutDisclaimer:
      'SPHEREx Explorer không phải sản phẩm chính thức của NASA. Ứng dụng sử dụng dữ liệu công khai do NASA phát hành qua Kho lưu trữ Khoa học Hồng ngoại (IRSA).',
    teamMembersLabel: 'Thành viên nhóm',
    teamRoles: {
      'Thạch': 'Thiết kế giao diện và điều phối',
      'Duy Hoàng': 'Frontend, triển khai và kiểm thử',
      'Đông': 'Backend API và bộ nhớ đệm',
      'Khôi': 'Dữ liệu lưu trữ NASA (IRSA) và cơ sở dữ liệu',
      'Hữu Hoàng': 'Xử lý ảnh',
      'Nguyên': 'Khoa học và kiểm chứng',
    },
    ctaTitle: 'Ngắm bầu trời chuyển động',
    ctaBody: 'Vào thẳng phần so sánh sao lùn nâu WISE 0855, hoặc bắt đầu từ Trái Đất rồi dạo khắp bầu trời hồng ngoại.',
  },
}
