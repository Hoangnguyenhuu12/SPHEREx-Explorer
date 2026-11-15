import dongPhoto from '../../assets/team/dong.webp'
import duyHoangPhoto from '../../assets/team/duy-hoang.webp'
import huuHoangPhoto from '../../assets/team/huu-hoang.webp'
import khoiPhoto from '../../assets/team/khoi.webp'
import nguyenPhoto from '../../assets/team/nguyen.webp'
import thachPhoto from '../../assets/team/thach.webp'

/** Team roles from the project context (PROJECT_CONTEXT.md, 14/11/2026). Pending team confirmation of names and links. */
export const TEAM_NAME = 'MINIONS'

export interface TeamMember {
  name: string
  role: string
  /** Square 320×320 WebP portrait, shown cropped to a circle. Originals are kept outside Git. */
  photo: string
}

export const TEAM: readonly TeamMember[] = [
  { name: 'Thạch', role: 'Interface design and coordination', photo: thachPhoto },
  { name: 'Duy Hoàng', role: 'Frontend, deployment and testing', photo: duyHoangPhoto },
  { name: 'Đông', role: 'Backend API and caching', photo: dongPhoto },
  { name: 'Khôi', role: 'NASA archive data (IRSA) and database', photo: khoiPhoto },
  { name: 'Hữu Hoàng', role: 'Image processing', photo: huuHoangPhoto },
  { name: 'Nguyên', role: 'Science and validation', photo: nguyenPhoto },
]
