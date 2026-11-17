import type { TargetKey } from '../config/targets'
import type { Language } from './language'

export type StorySectionId = 'purpose' | 'how' | 'science' | 'honest' | 'about'

export interface StoryCopy {
  headerActionLabel: string
  statusLabels: Record<'planned' | 'built' | 'pending', string>
  eyebrow: string
  title: string
  lead: string
  flowTrailLabel: string
  flowHome: string
  flowStory: string
  flowHereTag: string
  flowOrbit: string
  flowNextTag: string
  flowEyes: string
  tocLabel: string
  sections: readonly { id: StorySectionId; title: string }[]
  purposeIntro: string
  purposeSeeMove: string
  purposeSeeBrightness: string
  purposeLookAnywhereLabel: string
  purposeLookAnywhereBody: string
  whoTitle: string
  whoItems: readonly { label: string; body: string }[]
  howIntroPrefix: string
  howIntroOrbit: string
  howIntroMiddle: string
  howIntroEyes: string
  howIntroSuffix: string
  stepsLabel: string
  steps: readonly { title: string; text: string }[]
  toolbarTitle: string
  toolbarItems: readonly (
    | { kind: 'radec' }
    | { kind: 'gaia' }
    | { kind: 'surveys' }
    | { kind: 'nav' }
  )[]
  illustrativeNote: string
  howCtaHint: string
  scienceIntro: string
  scienceSubs: readonly [string, string, string, string]
  scienceNote: string
  honestItems: readonly { title: string; body: string }[]
  detectorsTitle: string
  detectorsCaption: string
  detectorHeaders: readonly [string, string, string]
  detectorBands: Record<'Near infrared' | 'Infrared' | 'Thermal infrared', string>
  targetsTitle: string
  targetMotionTag: string
  targetBrightnessTag: string
  targets: Record<
    TargetKey,
    {
      name: string
      kind: string
      distance: string
      description: string
      lookFor: string
    }
  >
  dataSourcesTitle: string
  dataSources: readonly string[]
  pendingResultsNote: string
  aboutIntro: (teamName: string) => string
  aboutCtaLabel: string
  aboutCtaHint: string
  portraitAlt: (name: string) => string
  diagrams: {
    notePrefix: string
    colour: {
      stars: readonly [
        { label: string; um: string },
        { label: string; um: string },
        { label: string; um: string },
      ]
      choiceLabel: string
      pause: string
      play: string
      livePrefix: string
      ariaLabel: string
      note: string
      shorter: string
      longer: string
      driftCaption: string
    }
    motion: {
      dates: readonly [string, string, string]
      choiceLabel: string
      pause: string
      play: string
      ariaLabel: string
      note: string
      scaleLabel: string
      nearbyStar: string
    }
    difference: {
      sliderLabel: string
      stillText: string
      movedText: string
      ariaLabel: string
      note: string
      firstDate: string
      laterDate: string
      difference: string
    }
    timeline: {
      marks: readonly [
        { top: string; bottom: string; info: string },
        { top: string; bottom: string; info: string },
        { top: string; bottom: string; info: string },
        { top: string; bottom: string; info: string },
        { top: string; bottom: string; info: string },
      ]
      clickHint: string
      ariaLabel: string
      note: string
      bottomCaption: string
    }
  }
}

export const STORY_COPY: Record<Language, StoryCopy> = {
  en: {
    headerActionLabel: 'SPHEREx Orbit',
    statusLabels: { planned: 'Planned', built: 'Built', pending: 'Results pending' },
    eyebrow: 'The story',
    title: 'Watch the sky change, with NASA’s newest infrared telescope',
    lead: 'What SPHEREx Explorer is for, how to use it in four steps, the science behind what you see, and the people who built it.',
    flowTrailLabel: 'Your path through the site',
    flowHome: 'Home',
    flowStory: 'Story',
    flowHereTag: 'you are here',
    flowOrbit: 'SPHEREx Orbit',
    flowNextTag: 'next',
    flowEyes: 'The Eyes',
    tocLabel: 'Sections',
    sections: [
      { id: 'purpose', title: 'What you can do here' },
      { id: 'how', title: 'How to use it' },
      { id: 'science', title: 'The science, in pictures' },
      { id: 'honest', title: 'Reading it honestly' },
      { id: 'about', title: 'About us' },
    ],
    purposeIntro:
      'SPHEREx Explorer shows real NASA SPHEREx infrared images of a small patch of sky in date order, so you can see a nearby star creep across the background or change in brightness. No data files, no code, no astronomy degree.',
    purposeSeeMove: 'See a star move:',
    purposeSeeBrightness: 'See a star change brightness:',
    purposeLookAnywhereLabel: 'Look anywhere:',
    purposeLookAnywhereBody: 'type any star name or coordinates and find it on the sky map.',
    whoTitle: 'Who it is for',
    whoItems: [
      { label: 'Students and teachers:', body: 'show that stars really move, with real telescope images instead of a drawing.' },
      { label: 'Sky fans:', body: 'explore NASA’s archive without learning archive tools or reading FITS files.' },
      { label: 'Judges and reviewers:', body: 'see quickly what the data shows, and where its limits are.' },
    ],
    howIntroPrefix: 'Start on ',
    howIntroOrbit: 'SPHEREx Orbit',
    howIntroMiddle: ', then explore the sky in ',
    howIntroEyes: 'The Eyes',
    howIntroSuffix: '. A first visit takes about a minute:',
    stepsLabel: 'Four steps to use The Eyes',
    steps: [
      {
        title: 'Find SPHEREx in orbit',
        text: 'SPHEREx Orbit shows the Solar System, Earth and SPHEREx’s orbit. Click Earth to zoom in, then press Open The Eyes.',
      },
      { title: 'Pick a star', text: 'In The Eyes, choose a featured target, or type a star name or coordinates.' },
      {
        title: 'Press Play and compare',
        text: 'SPHEREx images step through in date order. Look for a star that shifts or changes brightness, or switch to Difference.',
      },
      { title: 'Read the notes', text: 'Check the date, detector and wavelength of each image, and the charts and quality flags.' },
    ],
    toolbarTitle: 'The toolbar at the bottom of the map in The Eyes',
    toolbarItems: [{ kind: 'radec' }, { kind: 'gaia' }, { kind: 'surveys' }, { kind: 'nav' }],
    illustrativeNote: 'Images marked “Illustrative demo” are generated to show how the tool works. They are not what SPHEREx saw.',
    howCtaHint: 'See SPHEREx in the Solar System, then open The Eyes',
    scienceIntro:
      'SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) is a NASA telescope that maps the whole sky in infrared light. Four ideas are enough to read what you see in The Eyes.',
    scienceSubs: [
      '1. It sees the sky in 102 colours',
      '2. Nearby stars drift against distant ones',
      '3. Blinking and subtracting reveal the change',
      '4. It maps the whole sky about every six months',
    ],
    scienceNote:
      'Behind the player, small cutouts are taken from the NASA/IPAC Infrared Science Archive (IRSA), lined up on one grid of 6.15-arcsecond pixels, shown with the same brightness scale, and the target’s catalogue position is moved forward to each date. That is why a change you see comes from the sky, not from the display.',
    honestItems: [
      {
        title: 'Small steps.',
        body: 'Barnard’s Star moves about 10 arcseconds a year, under two SPHEREx pixels. Changes need observations months apart to show.',
      },
      {
        title: 'Few dates.',
        body: 'With one map every six months, a target may have only a handful of observations so far.',
      },
      {
        title: 'Bright stars saturate.',
        body: 'The centre of a very bright star can stop counting and look flat.',
      },
      {
        title: 'Wavelength matters.',
        body: 'Two frames at different wavelengths can differ in brightness without the star changing.',
      },
    ],
    detectorsTitle: 'The six detectors',
    detectorsCaption: 'SPHEREx detectors and wavelength ranges',
    detectorHeaders: ['Detector', 'Wavelength', 'Band'],
    detectorBands: {
      'Near infrared': 'Near infrared',
      Infrared: 'Infrared',
      'Thermal infrared': 'Thermal infrared',
    },
    targetsTitle: 'The five featured targets',
    targetMotionTag: 'Shows motion.',
    targetBrightnessTag: 'Shows brightness changes.',
    targets: {
      barnard: {
        name: "Barnard's Star",
        kind: 'Nearby red dwarf',
        distance: 'about 6 light-years',
        description: 'One of the closest stars to the Sun. It crosses the sky faster than any other star, about 10 arcseconds every year.',
        lookFor: 'Compare its position with the stars around it as the dates advance.',
      },
      wise0855: {
        name: 'WISE 0855−0714',
        kind: 'Very cold brown dwarf',
        distance: 'about 7 light-years',
        description: 'The coldest brown dwarf known. It is almost invisible to the eye but glows in infrared light, which SPHEREx collects.',
        lookFor: 'Look for a faint dot that shifts between dates. The longest-wavelength detectors (D5–D6) suit it best.',
      },
      epsindib: {
        name: 'Epsilon Indi B',
        kind: 'Brown dwarf pair',
        distance: 'about 12 light-years',
        description:
          'Two brown dwarfs orbiting each other, travelling together with the star Epsilon Indi A. At SPHEREx resolution the pair appears as one source.',
        lookFor: 'Look for shared motion with its companion star when the field is wide enough to include both.',
      },
      rwaur: {
        name: 'RW Aurigae',
        kind: 'Young variable star',
        distance: 'several hundred light-years',
        description: 'A very young star system surrounded by dust. Its brightness drops irregularly when dust passes in front of the star.',
        lookFor: 'Compare its brightness between dates. Check the wavelength and quality notes before reading anything into a change.',
      },
      rdra: {
        name: 'R Draconis',
        kind: 'Pulsating red giant (Mira variable)',
        distance: 'not well measured',
        description: 'A giant star that swells and shrinks over about eight months, becoming much brighter and fainter as it pulses.',
        lookFor: 'Compare its brightness between dates. Bright frames may saturate the detector.',
      },
    },
    dataSourcesTitle: 'Where the data comes from',
    dataSources: [
      'SPHEREx images: NASA/IPAC Infrared Science Archive (IRSA — DR1 & QR3).',
      'Multi-epoch infrared timeline: unWISE time-resolved coadds (W1/W2) via WiseView.',
      'Background sky map: SPHEREx DR1 all-sky cube served by IRSA, shown with Aladin Lite (CDS).',
      'Catalogue stars: ESA Gaia DR3 via STScI MAST and CDS VizieR. Target positions and motions: SIMBAD.',
      'Moving-target archive test suite: CSA NEOSSat observations via CADC (CAOM-2).',
      'Earth imagery on “SPHEREx Orbit”: NASA Blue Marble.',
    ],
    pendingResultsNote: 'We will report measured results here only after checking them on real SPHEREx observations.',
    aboutIntro: (teamName: string) =>
      `We are team ${teamName}, six people who built SPHEREx Explorer for the NASA Space Apps 2026 SPHEREx Sky Viewer challenge.`,
    aboutCtaLabel: 'Start: SPHEREx Orbit',
    aboutCtaHint: 'Your first step towards The Eyes',
    portraitAlt: (name: string) => `Portrait of ${name}`,
    diagrams: {
      notePrefix: 'Note:',
      colour: {
        stars: [
          { label: 'Exposure 1', um: 'shorter wavelength' },
          { label: 'Exposure 2', um: 'middle wavelength' },
          { label: 'Exposure 3', um: 'longer wavelength' },
        ],
        choiceLabel: 'Exposure',
        pause: 'Pause',
        play: 'Play the drift',
        livePrefix: ': the same star is seen at a ',
        ariaLabel:
          'Diagram: a SPHEREx detector whose filter changes colour from one side to the other. As the sky drifts, the same star lands on a different colour in each exposure.',
        note: 'Each of SPHEREx’s six detectors sits behind a filter that changes colour from one edge to the other. As the telescope steps across the sky, the same star is photographed through many colours. Together the detectors cover 0.75 to 5 micrometres in 102 colours, with pixels about 6.15 arcseconds wide.',
        shorter: 'shorter wavelength',
        longer: 'longer wavelength',
        driftCaption: 'the sky drifts across the detector',
      },
      motion: {
        dates: ['May ’25', 'Nov ’25', 'May ’26'],
        choiceLabel: 'Observation date',
        pause: 'Pause',
        play: 'Blink the dates',
        ariaLabel: 'Diagram: a grid of SPHEREx pixels with fixed background stars and a nearby star that moves a little to the right every six months.',
        note: 'Distant stars look fixed, but nearby stars drift across them. Barnard’s Star moves about 10 arcseconds a year, under two SPHEREx pixels, so you need images months apart to see it. Use The Eyes to compare the star across observation dates.',
        scaleLabel: '1 square = 1 SPHEREx pixel (6.15″)',
        nearbyStar: 'nearby star',
      },
      difference: {
        sliderLabel: 'How far the star moved',
        stillText: 'No motion: the difference is flat grey.',
        movedText: 'Moved: a dark spot where it was and a bright spot where it is now.',
        ariaLabel: 'Diagram: first observation, later observation, and their difference showing a dark spot where the star was and a bright spot where it is now',
        note: 'The Difference view subtracts the first date from a later one. Stars that stay put cancel out to grey. A star that moved leaves a dark spot where it was and a bright spot where it is now.',
        firstDate: 'First date',
        laterDate: 'Later date',
        difference: 'Difference',
      },
      timeline: {
        marks: [
          { top: 'Launch', bottom: '11 Mar 2025', info: 'SPHEREx launched on 11 March 2025.' },
          { top: 'Survey starts', bottom: '1 May 2025', info: 'Science observations began on 1 May 2025.' },
          { top: 'Map 1', bottom: '≈ Nov 2025', info: 'The first full map of the sky: every target gets its first date.' },
          { top: 'Map 2', bottom: '≈ May 2026', info: 'A second date per target, enough to blink and compare.' },
          { top: 'Map 3', bottom: '≈ Nov 2026', info: 'A year after Map 1, so slow movers like Barnard’s Star shift visibly.' },
        ],
        clickHint: 'Click a dot on the timeline.',
        ariaLabel:
          'Timeline: SPHEREx launched on 11 March 2025, began its survey on 1 May 2025 and completes a full map of the sky about every six months.',
        note: 'SPHEREx launched on 11 March 2025 and began its survey on 1 May 2025. It completes a map of the whole sky about every six months, so each target gets a few new dates per year. Map dates here are approximate.',
        bottomCaption: 'a new all-sky map about every six months',
      },
    },
  },
  vi: {
    headerActionLabel: 'Quỹ đạo SPHEREx',
    statusLabels: { planned: 'Dự kiến', built: 'Đã hoàn thiện', pending: 'Chưa có kết quả đo' },
    eyebrow: 'Câu chuyện dự án',
    title: 'Ngắm bầu trời chuyển mình qua kính thiên văn hồng ngoại mới nhất của NASA',
    lead: 'SPHEREx Explorer giúp bạn làm gì, cách dùng nhanh chỉ trong bốn bước, phần khoa học đằng sau từng bức ảnh và đội ngũ thực hiện.',
    flowTrailLabel: 'Lộ trình trải nghiệm trên trang',
    flowHome: 'Trang chủ',
    flowStory: 'Câu chuyện',
    flowHereTag: 'bạn đang ở đây',
    flowOrbit: 'Quỹ đạo SPHEREx',
    flowNextTag: 'tiếp theo',
    flowEyes: 'Đôi mắt',
    tocLabel: 'Mục lục',
    sections: [
      { id: 'purpose', title: 'Bạn có thể làm gì tại đây' },
      { id: 'how', title: 'Cách sử dụng' },
      { id: 'science', title: 'Khoa học qua hình ảnh' },
      { id: 'honest', title: 'Đọc dữ liệu đúng cách' },
      { id: 'about', title: 'Về chúng mình' },
    ],
    purposeIntro:
      'SPHEREx Explorer xếp các ảnh hồng ngoại thực tế do tàu SPHEREx của NASA chụp tại một góc trời theo đúng thứ tự ngày tháng, nhờ đó bạn có thể thấy tận mắt một ngôi sao gần trôi ngang nền trời hay thay đổi độ sáng. Không cần tải file, không cần viết code, cũng không cần nền tảng thiên văn chuyên sâu.',
    purposeSeeMove: 'Xem sao dịch chuyển:',
    purposeSeeBrightness: 'Xem sao đổi sáng:',
    purposeLookAnywhereLabel: 'Tìm bất kỳ vùng trời nào:',
    purposeLookAnywhereBody: 'gõ tên ngôi sao hoặc nhập tọa độ bất kỳ để mở ngay trên bản đồ sao.',
    whoTitle: 'Dành cho ai',
    whoItems: [
      {
        label: 'Học sinh, sinh viên và giáo viên:',
        body: 'trực quan hóa chuyện các vì sao thực sự chuyển động bằng ảnh kính thiên văn thật thay vì hình vẽ minh họa.',
      },
      {
        label: 'Người yêu thiên văn:',
        body: 'dạo quanh kho dữ liệu của NASA mà không phải làm quen công cụ tra cứu phức tạp hay xử lý tệp FITS.',
      },
      {
        label: 'Ban giám khảo và người đánh giá:',
        body: 'nắm bắt ngay dữ liệu thực tế cho thấy điều gì và giới hạn hiện tại nằm ở đâu.',
      },
    ],
    howIntroPrefix: 'Bắt đầu từ ',
    howIntroOrbit: 'Quỹ đạo SPHEREx',
    howIntroMiddle: ', sau đó soi bầu trời trong ',
    howIntroEyes: 'Đôi mắt',
    howIntroSuffix: '. Lần đầu làm quen chỉ mất chừng một phút:',
    stepsLabel: 'Bốn bước dùng Đôi mắt',
    steps: [
      {
        title: 'Tìm tàu SPHEREx trên quỹ đạo',
        text: 'Trang Quỹ đạo SPHEREx hiển thị Hệ Mặt Trời, Trái Đất và đường bay quanh địa cầu của tàu. Nhấn vào Trái Đất để phóng to, rồi bấm Mở Đôi mắt.',
      },
      { title: 'Chọn một ngôi sao', text: 'Trong Đôi mắt, chọn một trong năm mục tiêu gợi ý hoặc gõ thẳng tên sao hay tọa độ muốn xem.' },
      {
        title: 'Nhấn Phát và đối chiếu',
        text: 'Các ảnh SPHEREx sẽ chạy nối tiếp theo mốc ngày. Để ý xem ngôi sao có nhích chỗ hay sáng tối khác đi không, hoặc bật chế độ Difference (Ảnh hiệu).',
      },
      { title: 'Đọc ghi chú kỹ thuật', text: 'Kiểm tra ngày chụp, cảm biến, bước sóng của từng khung hình cùng biểu đồ và cờ chất lượng.' },
    ],
    toolbarTitle: 'Thanh công cụ phía dưới bản đồ trong Đôi mắt',
    toolbarItems: [{ kind: 'radec' }, { kind: 'gaia' }, { kind: 'surveys' }, { kind: 'nav' }],
    illustrativeNote: 'Các hình ghi “Illustrative demo” được dựng để minh họa cách công cụ hoạt động, không phải ảnh thật do SPHEREx chụp.',
    howCtaHint: 'Xem tàu SPHEREx trong Hệ Mặt Trời rồi chuyển sang Đôi mắt',
    scienceIntro:
      'SPHEREx (viết tắt của Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) là kính thiên văn không gian của NASA lập bản đồ toàn bầu trời bằng ánh sáng hồng ngoại. Chỉ cần nắm bốn ý dưới đây là bạn đọc hiểu trọn vẹn những gì hiện ra trong Đôi mắt.',
    scienceSubs: [
      '1. Kính nhìn bầu trời qua 102 dải màu',
      '2. Sao ở gần trôi chậm trước nền sao xa',
      '3. Chớp so sánh và trừ ảnh làm lộ rõ thay đổi',
      '4. Quét lại toàn bộ bầu trời mỗi sáu tháng',
    ],
    scienceNote:
      'Phía sau trình phát, từng khung cắt nhỏ lấy từ Kho lưu trữ Khoa học Hồng ngoại NASA/IPAC (IRSA) được căn trùng lên một lưới pixel 6,15 giây cung, giữ nguyên thang độ sáng và cập nhật tọa độ danh mục của ngôi sao theo đúng từng ngày chụp. Nhờ vậy, mọi chuyển động bạn thấy đều đến từ bầu trời thật chứ không phải do ảnh bị lệch.',
    honestItems: [
      {
        title: 'Bước dịch chuyển rất nhỏ.',
        body: 'Sao Barnard đi khoảng 10 giây cung mỗi năm — chưa tới hai pixel của SPHEREx — nên cần các bức ảnh cách nhau nhiều tháng mới nhận ra.',
      },
      {
        title: 'Số mốc ngày chưa nhiều.',
        body: 'Với chu kỳ sáu tháng một bản đồ toàn trời, mỗi mục tiêu hiện mới tích lũy được một số ít lần chụp.',
      },
      {
        title: 'Sao quá sáng có thể bị cháy sáng.',
        body: 'Vùng tâm của các ngôi sao cực sáng đôi khi vượt ngưỡng đếm của cảm biến và bị bệt phẳng.',
      },
      {
        title: 'Khác bước sóng là khác độ sáng.',
        body: 'Hai khung hình ở hai bước sóng khác nhau vốn đã có độ sáng chênh lệch, dù bản thân ngôi sao không hề đổi.',
      },
    ],
    detectorsTitle: 'Sáu cảm biến của tàu',
    detectorsCaption: 'Các cảm biến và dải bước sóng của SPHEREx',
    detectorHeaders: ['Cảm biến', 'Bước sóng', 'Vùng phổ'],
    detectorBands: {
      'Near infrared': 'Cận hồng ngoại',
      Infrared: 'Hồng ngoại',
      'Thermal infrared': 'Hồng ngoại nhiệt',
    },
    targetsTitle: 'Năm mục tiêu tiêu biểu',
    targetMotionTag: 'Thể hiện chuyển động.',
    targetBrightnessTag: 'Thể hiện đổi sáng.',
    targets: {
      barnard: {
        name: "Sao Barnard (Barnard's Star)",
        kind: 'Sao lùn đỏ lân cận',
        distance: 'cách ~6 năm ánh sáng',
        description: 'Một trong những ngôi sao gần Mặt Trời nhất và cũng là sao băng ngang bầu trời nhanh nhất, dịch khoảng 10 giây cung mỗi năm.',
        lookFor: 'Quan sát vị trí của nó so với các sao lân cận khi ngày chụp tiến dần về sau.',
      },
      wise0855: {
        name: 'WISE 0855−0714',
        kind: 'Sao lùn nâu siêu lạnh',
        distance: 'cách ~7 năm ánh sáng',
        description: 'Sao lùn nâu lạnh nhất từng được phát hiện. Mắt thường gần như không thấy, nhưng nó tỏa sáng ở dải hồng ngoại mà SPHEREx thu được.',
        lookFor: 'Tìm đốm sáng mờ dịch chuyển qua từng mốc ngày; hai cảm biến bước sóng dài nhất (D5–D6) nhìn rõ nhất.',
      },
      epsindib: {
        name: 'Epsilon Indi B',
        kind: 'Cặp sao lùn nâu đôi',
        distance: 'cách ~12 năm ánh sáng',
        description:
          'Hai sao lùn nâu quay quanh nhau, cùng đồng hành với ngôi sao Epsilon Indi A. Ở độ phân giải SPHEREx, cả hai chập lại thành một đốm sáng.',
        lookFor: 'Khi khung nhìn đủ rộng để thấy cả ngôi sao đồng hành, bạn sẽ thấy cặp đôi này di chuyển cùng hướng với nó.',
      },
      rwaur: {
        name: 'RW Aurigae',
        kind: 'Sao trẻ biến quang',
        distance: 'cách vài trăm năm ánh sáng',
        description: 'Một hệ sao non trẻ còn bao bọc trong đĩa bụi; độ sáng của nó sụt giảm thất thường mỗi khi các đám mây bụi chắn ngang phía trước.',
        lookFor: 'So sánh độ sáng giữa các ngày chụp, nhớ kiểm tra bước sóng và ghi chú chất lượng trước khi kết luận.',
      },
      rdra: {
        name: 'R Draconis',
        kind: 'Sao khổng lồ đỏ co giãn (biến quang Mira)',
        distance: 'khoảng cách chưa đo chính xác',
        description: 'Một ngôi sao khổng lồ phồng lên rồi xẹp xuống theo chu kỳ khoảng tám tháng, khiến độ sáng tăng giảm rất mạnh.',
        lookFor: 'Đối chiếu độ sáng qua từng mốc ngày; những khung hình lúc sao đạt cực sáng có thể làm bão hòa cảm biến.',
      },
    },
    dataSourcesTitle: 'Nguồn dữ liệu',
    dataSources: [
      'Ảnh SPHEREx: Kho lưu trữ Khoa học Hồng ngoại NASA/IPAC (IRSA — DR1 & QR3).',
      'Chuỗi thời gian hồng ngoại nhiều thập kỷ: ảnh ghép unWISE (W1/W2) qua WiseView.',
      'Bản đồ nền toàn bầu trời: khối dữ liệu SPHEREx DR1 từ IRSA, hiển thị bằng Aladin Lite (CDS).',
      'Sao tham chiếu danh mục: ESA Gaia DR3 qua STScI MAST và CDS VizieR. Vị trí và chuyển động riêng: SIMBAD.',
      'Bộ dữ liệu kiểm thử mục tiêu chuyển động: ảnh CSA NEOSSat qua CADC (CAOM-2).',
      'Ảnh Trái Đất trong mục “Quỹ đạo SPHEREx”: NASA Blue Marble.',
    ],
    pendingResultsNote: 'Các kết quả đo đạc sẽ chỉ được cập nhật tại đây sau khi đã kiểm chứng trực tiếp trên ảnh quan sát thật của SPHEREx.',
    aboutIntro: (teamName: string) =>
      `Chúng mình là đội ${teamName}, gồm sáu thành viên cùng phát triển SPHEREx Explorer cho thử thách NASA Space Apps 2026 SPHEREx Sky Viewer.`,
    aboutCtaLabel: 'Bắt đầu: Quỹ đạo SPHEREx',
    aboutCtaHint: 'Bước đầu tiên hướng tới Đôi mắt',
    portraitAlt: (name: string) => `Ảnh chân dung ${name}`,
    diagrams: {
      notePrefix: 'Ghi chú:',
      colour: {
        stars: [
          { label: 'Lần chụp 1', um: 'bước sóng ngắn' },
          { label: 'Lần chụp 2', um: 'bước sóng trung bình' },
          { label: 'Lần chụp 3', um: 'bước sóng dài' },
        ],
        choiceLabel: 'Lần chụp',
        pause: 'Tạm dừng',
        play: 'Chạy mô phỏng',
        livePrefix: ': cùng một ngôi sao hiện ra ở ',
        ariaLabel:
          'Sơ đồ: một cảm biến SPHEREx với kính lọc đổi màu từ đầu này sang đầu kia. Khi bầu trời trôi qua, cùng một ngôi sao rơi vào vùng bước sóng khác nhau sau mỗi lần chụp.',
        note: 'Mỗi cảm biến trong sáu cảm biến của SPHEREx được đặt sau một kính lọc đổi màu liên tục từ mép này sang mép kia. Khi kính thiên văn quét ngang bầu trời, cùng một ngôi sao được chụp qua hàng loạt dải màu. Tổng cộng tàu phủ từ 0,75 đến 5 micromét với 102 kênh phổ và pixel rộng khoảng 6,15 giây cung.',
        shorter: 'bước sóng ngắn hơn',
        longer: 'bước sóng dài hơn',
        driftCaption: 'bầu trời trôi ngang qua cảm biến',
      },
      motion: {
        dates: ['T5/25', 'T11/25', 'T5/26'],
        choiceLabel: 'Mốc quan sát',
        pause: 'Tạm dừng',
        play: 'Chớp qua các mốc',
        ariaLabel: 'Sơ đồ lưới pixel SPHEREx gồm các sao nền đứng yên và một ngôi sao gần nhích nhẹ sang phải sau mỗi sáu tháng.',
        note: 'Những ngôi sao ở rất xa gần như đứng im, còn sao ở gần thì trôi ngang nền trời. Sao Barnard dịch chuyển khoảng 10 giây cung mỗi năm — chưa tới hai pixel SPHEREx — nên cần ảnh chụp cách nhau nhiều tháng mới thấy rõ. Hãy mở Đôi mắt để đối chiếu qua từng mốc ngày.',
        scaleLabel: '1 ô = 1 pixel SPHEREx (6,15″)',
        nearbyStar: 'sao ở gần',
      },
      difference: {
        sliderLabel: 'Mức độ sao đã dịch chuyển',
        stillText: 'Chưa nhúc nhích: ảnh hiệu chỉ còn nền xám phẳng.',
        movedText: 'Đã dịch chuyển: để lại một đốm tối ở chỗ cũ và một đốm sáng ở chỗ mới.',
        ariaLabel: 'Sơ đồ gồm ảnh ngày đầu, ảnh ngày sau và ảnh hiệu cho thấy một đốm tối ở vị trí cũ và một đốm sáng ở vị trí mới',
        note: 'Chế độ Difference (Ảnh hiệu) lấy ảnh ngày sau trừ đi ảnh ngày đầu. Các sao đứng yên tự triệt tiêu về xám trung tính, còn ngôi sao nào đã dịch chuyển sẽ hiện thành một đốm tối ở chỗ cũ và một đốm sáng ở vị trí mới.',
        firstDate: 'Ngày đầu',
        laterDate: 'Ngày sau',
        difference: 'Ảnh hiệu',
      },
      timeline: {
        marks: [
          { top: 'Phóng tàu', bottom: '11/03/2025', info: 'SPHEREx được phóng lên quỹ đạo ngày 11/03/2025.' },
          { top: 'Bắt đầu khảo sát', bottom: '01/05/2025', info: 'Hoạt động quan sát khoa học chính thức bắt đầu từ 01/05/2025.' },
          { top: 'Bản đồ 1', bottom: '≈ T11/2025', info: 'Bản đồ toàn bầu trời đầu tiên: mọi mục tiêu có mốc ngày mở đầu.' },
          { top: 'Bản đồ 2', bottom: '≈ T5/2026', info: 'Có thêm mốc ngày thứ hai cho mỗi mục tiêu, đủ để chớp đối chiếu hai ảnh.' },
          { top: 'Bản đồ 3', bottom: '≈ T11/2026', info: 'Tròn một năm sau Bản đồ 1, đủ để những sao trôi chậm như sao Barnard lộ rõ độ lệch.' },
        ],
        clickHint: 'Nhấn vào từng chấm trên trục thời gian.',
        ariaLabel: 'Mốc thời gian: SPHEREx phóng ngày 11/03/2025, bắt đầu khảo sát ngày 01/05/2025 và hoàn tất một bản đồ toàn bầu trời khoảng mỗi sáu tháng.',
        note: 'SPHEREx phóng ngày 11/03/2025 và khởi động khảo sát từ 01/05/2025. Tàu hoàn thành một bản đồ toàn bầu trời khoảng mỗi sáu tháng, mang lại vài mốc ngày mới mỗi năm cho từng mục tiêu. Các mốc bản đồ ở đây chỉ mang tính ước lượng.',
        bottomCaption: 'mỗi sáu tháng thêm một bản đồ toàn trời',
      },
    },
  },
}
