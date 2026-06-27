import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { Click } from '../../analytics/entities/click.entity';

@Entity('links')
export class Link {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Index()
  shortCode: string;

  @Column()
  originalUrl: string;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Column({ default: 0 })
  clickCount: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Click, (click) => click.link)
  clicks: Click[];
}
