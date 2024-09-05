/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from 'output/entities/Product';
import { Repository } from 'typeorm';
import { Brand } from 'output/entities/Brand';
import { Category } from 'output/entities/Category';
import { ProductResponseDto } from './dto/product-respone.dto';
import { Event } from 'output/entities/Event';
import { EventDetail } from 'output/entities/EventDetail';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productResponsitory: Repository<Product>,
    @InjectRepository(Brand)
    private readonly brandRepository: Repository<Brand>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Event)
    private readonly eventRespository: Repository<Event>,
    @InjectRepository(EventDetail)
    private readonly eventDetailRepository: Repository<EventDetail>,
  ) {}

  async createProduct(createProductDto: CreateProductDto): Promise<Product> {
    const { categoryId, brandId, ...productDetails } = createProductDto;

    // Kiểm tra danh mục
    const category = await this.categoryRepository.findOne({
      where: { categoryId: categoryId },
    });

    if (!category) {
      throw new BadRequestException(
        `Category with ID ${categoryId} does not exist`,
      );
    }

    // Kiểm tra Brand
    const brand = await this.brandRepository.findOne({
      where: { brandId: brandId },
    });
    if (!brand) {
      throw new BadRequestException(`Brand with Id ${brandId} does not exist`);
    }

    //Kiểm tra Event

    // Tạo sản phẩm
    const product = this.productResponsitory.create({
      ...productDetails,
      category, // Set the category as an object
      brand,
      status:
        productDetails.status !== undefined ? productDetails.status : true, // Default to true if not provided
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Lưu sản phẩm
    const savedProduct = await this.productResponsitory.save(product);

    return savedProduct;
  }
  async getAllProducts(): Promise<{ products: ProductResponseDto[] }> {
    try {
      const products = await this.productResponsitory.find({
        where: { status: true },
        relations: ['category', 'brand', 'eventDetail', 'eventDetail.events'], // Load the related data
      });

      const pickProductFields = (product: Product): ProductResponseDto => {
        const {
          productId,
          name,
          descrption,
          price,
          quantity,
          status,
          cost,
          createdAt,
          updatedAt,
          category,
          brand,
          eventDetail,
        } = product;

        return {
          productId,
          name,
          descrption,
          price,
          quantity,
          status,
          cost,
          createdAt,
          updatedAt,
          category: category
            ? {
                id: category.categoryId,
                name: category.name,
                status: category.status,
              }
            : null,
          brand: brand
            ? {
                id: brand.brandId,
                name: brand.name,
                image: brand.image,
              }
            : null,
          events:
            eventDetail && eventDetail.length > 0
              ? eventDetail.map((eventdetail) => ({
                  eventid: eventdetail.eventId,
                  productid: eventdetail.productId,
                  discount: eventdetail.events.discount || null,
                  image: eventdetail.events.image || null,
                }))
              : null,
        };
      };

      const result = products.map(pickProductFields);
      console.log('result :>> ', result);

      return { products: result };
    } catch (error) {
      throw new Error('Failed to retrieve products');
    }
  }
  async findOne(productId: number): Promise<Product> {
    const product = await this.productResponsitory.findOne({
      where: { productId, status: true },
      relations: ['category', 'brand'],
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }
    return {
      ...product,
      category: product.category
        ? {
            ...product.category,
          }
        : null,
    };
  }

  async updateProduct(
    productId: number,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const { categoryId, brandId, eventId, ...productDetails } =
      updateProductDto;
    console.log('Update Product DTO:', updateProductDto);
    //Kiểm tra Product có tồn tại hay không?
    const product = await this.productResponsitory.findOne({
      where: { productId, status: true },
      relations: ['category', 'brand', 'eventDetail'],
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }
    // Kiểm tra xem Category mới có tồn tại không
    if (categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { categoryId: categoryId },
      });
      if (!category) {
        throw new BadRequestException(
          `Category with ID ${categoryId} does not exist`,
        );
      }
      product.category = category;
    }
    if (brandId) {
      const brand = await this.brandRepository.findOne({
        where: { brandId: brandId },
      });
      if (!brand) {
        throw new BadRequestException(
          `Brand with Id ${brandId} does not exist`,
        );
      }
      product.brand = brand;
    }
    if (eventId) {
      const events = await this.eventRespository.findOne({
        where: { eventId: eventId },
      });

      if (!events) {
        throw new BadRequestException(
          `Event with Id ${eventId} does not exsit`,
        );
      }
      if (!product.productId) {
        throw new BadRequestException(`Product ID is missing or invalid`);
      }
      let eventDetail = product.eventDetail.find(
        (detail) => detail.eventId === eventId,
      );
      if (!eventDetail) {
        eventDetail = this.eventDetailRepository.create({
          productId: product.productId,
          eventId: events.eventId,
          product,
          events: events,
        });
      }
      // console.log('Product ID:', eventDetail.productId);

      await this.eventDetailRepository.save(eventDetail);
    }

    //Cập nhật Product
    Object.assign(product, productDetails);

    const updatedProduct = this.productResponsitory.save(product);
    console.log('updatedProduct :>> ', updatedProduct);
    return updatedProduct;
  }

  async deleteProduct(productId: number): Promise<{ message: string }> {
    const product = await this.productResponsitory.findOne({
      where: { productId, status: true },
      relations: ['category', 'brand'],
    });
    if (!product) {
      throw new NotFoundException(`Product với ID ${productId} không tìm thấy`);
    }
    const category = product.category;

    const brand = product.brand;
    await this.productResponsitory.remove(product);

    if (category) {
      const productsInCategory = await this.productResponsitory.find({
        where: { category },
      });
      if (productsInCategory.length === 0) {
        await this.categoryRepository.remove(category);
      }
    }

    if (brand) {
      const productInBrand = await this.productResponsitory.find({
        where: { brand },
      });
      if (productInBrand.length === 0) {
        await this.brandRepository.remove(brand);
      }
    }
    return { message: `Product với ID ${productId} đã được xóa thành công` };
  }
}
