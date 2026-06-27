import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Link } from '../../link/entities/link.entity';

@Entity('clicks')
@Index(['linkId', 'clickedAt'])
export class Click {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  linkId: number;

  @ManyToOne(() => Link, (link) => link.clicks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'linkId' })
  link: Link;

  @Column({ nullable: true, length: 64 })
  ip: string;

  @Column({ nullable: true })
  @Index()
  userAgent: string;

  @Column({ nullable: true })
  referrer: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  browser: string;

  @Column({ nullable: true })
  os: string;

  @CreateDateColumn()
  @Index()
  clickedAt: Date;
}
