import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DailySaleStats, DailySaleStatsDocument } from './schemas/daily_sale_stats.schema';
import { Model, ObjectId, Types } from 'mongoose';
import { MonthlySaleStats, MonthlySaleStatsDocument } from './schemas/monthly_sale_stats.schema';
import { BadRequestException } from 'src/common/exceptions/http-exception';
import { REDIS_CLIENT } from 'src/common/constants/redis.const';
import Redis from 'ioredis';

interface TopItemSoldParams {
  restaurantId: string;
  fromDate: Date;
  toDate: Date;
  limit?: number;
}

// Keyword: Window functions in Mongodb for running totals, moving averages, rankings, percentiles, and cumulative sums.

@Injectable()
export class ReportService {

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectModel(DailySaleStats.name) private readonly dailySaleStatsModel: Model<DailySaleStatsDocument>,
    @InjectModel(MonthlySaleStats.name) private readonly monthlySaleStatsModel: Model<MonthlySaleStatsDocument>,
  ) {}



  // API
  async getOverallSalesStats(restaurantId: string) { // Defaut : last 30 days

    // Validate restaurantId
    if (Types.ObjectId.isValid(restaurantId) === false) {
      throw new BadRequestException('Invalid restaurant ID');
    }


    const now = new Date()
    now.setHours(0, 0, 0, 0) // Set to start of today
    const objId = new Types.ObjectId(restaurantId)

    const [dailyStats, monthlyStats] = await Promise.all([
      // Get daily growth stats for last 30 days
      this.getDailyGrowthStats(objId, now),

      // Get monthly stats (revenue, target) for last 12 months
      this.getMonthlyPerformanceStatsAndTarget(objId, now),
    ])

    // Top items performance in current month
    const currentMonthTopItems = monthlyStats.currentMonthTopItems
    

    return {
      dailyStats: dailyStats,
      monthlyStats: monthlyStats.allMonthlyStats,
      topItemsCurrentMonth: currentMonthTopItems
    }
  }


  // Helper methods
  /**
   * 
   * @param restaurantId: Types.ObjectId
   * @param now: Date
   * @returns 
    
      {
        "current": {
          "totalRevenue": 1500000,
          "totalOrders": 120,
          "totalItemsSold": 350
        },
        "previous": {
          "totalRevenue": 1200000,
          "totalOrders": 100,
          "totalItemsSold": 300
        },
        "revenueGrowthPercent": 25,
        "ordersGrowthPercent": 20,
        "itemsSoldGrowthPercent": 16.666666666666664
      }
    
   */
  async getDailyGrowthStats(restaurantId: Types.ObjectId, now: Date) {
    const totalDays = 30; // Default last 30 days

    const last30Start = new Date(now)
    last30Start.setHours(0, 0, 0, 0)
    last30Start.setDate(now.getDate() - totalDays)

    const prev30Start = new Date(now)
    prev30Start.setDate(now.getDate() - totalDays * 2)

    const stats = await this.dailySaleStatsModel.aggregate([
      { // Get stats for last 30 days and previous 60 days
        $match: {
          restaurantId: restaurantId,
          createdAt: { $gte: prev30Start }
        }
      },
      { // Group the data into 30-day of current stats and the previous 30-day stats}
        $facet: {
          current: this.matchAndGroupSumFields(last30Start, now),
          previous: this.matchAndGroupSumFields(prev30Start, last30Start)
        }
      },
      { // Extract data form arrays after $facet
        $project: {
          current: { $arrayElemAt: ['$current', 0] },
          previous: { $arrayElemAt: ['$previous', 0] }
        }
      },
      {
        $addFields: {
          revenueGrowthPercent: this.calcGrowthPercent('$current.totalRevenue', '$previous.totalRevenue'),
          ordersGrowthPercent: this.calcGrowthPercent('$current.totalOrders', '$previous.totalOrders'),
          itemsSoldGrowthPercent: this.calcGrowthPercent('$current.totalItemsSold', '$previous.totalItemsSold')
        }
      }
    ]).exec()

    return stats[0] || {}
  }

  /**
   * 
   * @param restaurantId 
   * @param now 
   * @returns {
   *  allMonthlyStats: Array<{
   *    totalRevenue: number,
   *    topItemsSold: any[],
   *    targetRevenue: number,
   *    createdAt: Date
   *  }>,
   *  currentMonthTopItems: any[]
   * }
   */
  async getMonthlyPerformanceStatsAndTarget(restaurantId: Types.ObjectId, now: Date) {
    const startDayOfCurrentYear = new Date(now)
    startDayOfCurrentYear.setMonth(0, 1) 

    const rawStats = await this.monthlySaleStatsModel.find({
      restaurantId: restaurantId,
      createdAt: { $gte: startDayOfCurrentYear }
    }).sort({ createdAt: 1 }).lean().exec()

    const statsMap = new Map<number, any>(rawStats.map((stat: any) => [stat.createdAt.getMonth(), stat]))
    const allMonthlyStats = Array.from({ length: 12 }, (_, month) => {
      return statsMap.has(month) ? statsMap.get(month) : {
        totalRevenue: 0,
        topItemsSold: [],
        targetRevenue: 10000000 + (1000000 * (month + 1)), // Example target
        createdAt: new Date(now.getFullYear(), month, 1)
      }
    })

    return {
      allMonthlyStats,
      currentMonthTopItems: allMonthlyStats[now.getMonth()].topItemsSold || []
    }
  }

  calcGrowthPercent(currField: string, prevField: string): object {
    return {
      $cond: [
        { $eq: [prevField, 0] },
        null,
        {
          $multiply: [
            {
              $divide: [
                { $subtract: [currField, prevField] },
                prevField
              ]
            },
            100
          ]
        }
      ]
    }
  }

  matchAndGroupSumFields(fromDate: Date, toDate: Date): any[] {
    return [
      { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalRevenue' },
          totalOrders: { $sum: '$totalOrders' },
          totalItemsSold: { $sum: '$totalItemsSold' }
        }
      }
    ]
  } 
 

  // EventDriven
  

}



/* // Get daily stats for last 30 days
    // const dailyStats = await this.dailySaleStatsModel.find({
    //   restaurantId: new Types.ObjectId(restaurantId)
    // }).sort({ date: -1 }).limit(29).lean().exec()

    const dailytStats = await this.dailySaleStatsModel.aggregate([
      { $match: { restaurantId: new Types.ObjectId(restaurantId) } },
      { $sort: { date: -1  } },
      { $limit: 30 },
      {
        $facet: {
          stats: [ 
            { $project: { totalRevenue: 1, totalOrders: 1, totalItemsSold: 1 } }
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$totalRevenue' },
                totalOrders: { $sum: '$totalOrders' },
                totalItemsSold: { $sum: '$totalItemsSold' }
              }
            }
          ]
        }
      }
    ]).exec(); */

    