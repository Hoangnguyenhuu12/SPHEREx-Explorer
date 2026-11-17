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
    myPosts: 'Bài viết của tôi',
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
    heroTitle: 'Đôi mắt của thiên hà',
    heroSlogan: 'Cứ mỗi sáu tháng, SPHEREx lại chụp ảnh toàn bộ bầu trời. Hãy xem điều gì đã thay đổi.',
    heroLead:
      'Chọn một ngôi sao, nhấn phát và theo dõi khảo sát hồng ngoại của NASA ghi lại cảnh nó trôi ngang bầu trời hay thay đổi độ sáng theo nhịp. Không cần tải tệp dữ liệu, không cần viết mã.',
    watchBrownDwarf: 'Xem sao lùn nâu chuyển động',
    exploreSky: 'Khám phá bầu trời',
    readStory: 'Đọc câu chuyện',
    howItWorksTitle: 'Cách hoạt động',
    howItWorksLead: 'Bốn bước từ một điểm trên bầu trời đến sự thay đổi bạn có thể nhìn thấy.',
    howItWorksHint: 'Di chuột vào từng bước để xem nội dung.',
    steps: [
      { title: 'Chọn một mục tiêu', body: 'Chọn một trong năm ngôi sao tiêu biểu, tìm theo tên, hoặc nhập bất kỳ tọa độ RA và Dec nào.' },
      {
        title: 'Chọn kênh hồng ngoại',
        body: 'SPHEREx có sáu cảm biến, từ 0,75 đến 5 micromét. Các thiên thể lạnh hơn sẽ hiện rõ ở bước sóng dài hơn.',
      },
      {
        title: 'Đi qua từng mốc thời gian',
        body: 'SPHEREx quét toàn bộ bầu trời khoảng sáu tháng một lần. Phát chuỗi quan sát như một đoạn phim ngắn.',
      },
      {
        title: 'Phát hiện điểm thay đổi',
        body: 'So sánh hai mốc ngày cạnh nhau hoặc lật qua lại A/B. Một cặp đốm sáng-tối ở chế độ Difference là manh mối để kiểm chứng lại trên ảnh gốc.',
      },
    ],
    aboutTitle: 'Về chúng tôi',
    aboutLead: (teamName: string) =>
      `Chúng tôi là đội ${teamName}, nhóm sáu thành viên xây dựng một công cụ độc lập cho thử thách NASA Space Apps 2026 SPHEREx Sky Viewer. Kho lưu trữ thiên văn vốn công khai nhưng khó tiếp cận: tệp FITS, hệ tọa độ và ngôn ngữ truy vấn tạo nên khoảng cách giữa người yêu khám phá và bầu trời. Chúng tôi muốn bất kỳ ai cũng có thể mở trang web và tận mắt xem một ngôi sao dịch chuyển.`,
    aboutDisclaimer:
      'SPHEREx Explorer không phải là sản phẩm chính thức của NASA. Ứng dụng sử dụng dữ liệu công khai do NASA phát hành thông qua Kho lưu trữ Khoa học Hồng ngoại (IRSA).',
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
    ctaBody: 'Đi thẳng vào phần so sánh sao lùn nâu WISE 0855, hoặc bắt đầu từ Trái Đất để du hành khắp bầu trời hồng ngoại.',
  },
}
