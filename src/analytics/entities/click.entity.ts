import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Link } from '../../link/entities/link.entity';

@Entity('clicks')
@Index(['linkId', 'clickedAt'])
@Index(['linkId', 'ip'])
@Index(['linkId', 'country'])
@Index(['linkId', 'browser'])
@Index(['linkId', 'os'])
@Index(['linkId', 'referrer'])
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
  @Index()
  ip: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true })
  referrer: string;

  @Column({ nullable: true })
  @Index()
  country: string;

  @Column({ nullable: true })
  @Index()
  browser: string;

  @Column({ nullable: true })
  @Index()
  os: string;

  @CreateDateColumn()
  @Index()
  clickedAt: Date;
}
