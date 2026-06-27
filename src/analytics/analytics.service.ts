import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Click } from './entities/click.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Click)
    private readonly clickRepository: Repository<Click>,
  ) {}

  async recordClick(
    linkId: number,
    ip?: string,
    userAgent?: string,
    referrer?: string,
  ): Promise<Click> {
    const click = this.clickRepository.create({ linkId, ip, userAgent, referrer });
    return this.clickRepository.save(click);
  }

  async getClicksByLinkId(linkId: number): Promise<Click[]> {
    return this.clickRepository.find({
      where: { linkId },
      order: { clickedAt: 'DESC' },
    });
  }

  async getClickCount(linkId: number): Promise<number> {
    return this.clickRepository.count({ where: { linkId } });
  }

  async getClicksGroupedByDate(linkId: number): Promise<{ date: string; count: string }[]> {
    return this.clickRepository
      .createQueryBuilder('click')
      .select("DATE(click.clickedAt)", "date")
      .addSelect("COUNT(*)", "count")
      .where("click.linkId = :linkId", { linkId })
      .groupBy("DATE(click.clickedAt)")
      .orderBy("DATE(click.clickedAt)", "DESC")
      .getRawMany();
  }
}
