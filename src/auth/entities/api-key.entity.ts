import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ApiKeyRole {
  ADMIN = 'admin',
  CUSTOMER = 'customer',
  READONLY = 'readonly',
  ANALYTICS = 'analytics',
}

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Index()
  keyHash: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'varchar', default: ApiKeyRole.CUSTOMER })
  role: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Column({ nullable: true })
  lastUsedAt?: Date;

  @Column({ nullable: true })
  rotatedFromId?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
