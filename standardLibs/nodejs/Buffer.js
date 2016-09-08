
/*      @class Buffer
    An Array-like Class for interracting with raw memory outside of the Node.js heap.
@argument/Number size
    @optional
@argument/Array|Buffer source
@spare `Library Documentation`
    @remote `https://nodejs.org/api/buffer.html#buffer_buffer`
@Function #write
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_write_string_offset_length_encoding`
@Function #writeUIntLE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeuintle_value_offset_bytelength_noassert`
@Function #writeUIntBE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeuintbe_value_offset_bytelength_noassert`
@Function #writeIntLE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeintle_value_offset_bytelength_noassert`
@Function #writeIntBE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeintbe_value_offset_bytelength_noassert`
@Function #readUIntLE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readuintle_offset_bytelength_noassert`
@Function #readUIntBE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readuintbe_offset_bytelength_noassert`
@Function #readIntLE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readintle_offset_bytelength_noassert`
@Function #readIntBE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readintbe_offset_bytelength_noassert`
@Function #toString
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_tostring_encoding_start_end`
@Function #toJSON
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_tojson`
@Function #equals
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_equals_otherbuffer`
@Function #compare
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_compare_otherbuffer`
@Function #copy
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_copy_targetbuffer_targetstart_sourcestart_sourceend`
@Function #slice
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_slice_start_end`
@Function #readUInt8
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readuint8_offset_noassert`
@Function #readUInt16LE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readuint16le_offset_noassert`
@Function #readUInt16BE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readuint16be_offset_noassert`
@Function #readUInt32LE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readuint32le_offset_noassert`
@Function #readUInt32BE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readuint32be_offset_noassert`
@Function #readInt8
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readint8_offset_noassert`
@Function #readInt16LE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readint16le_offset_noassert`
@Function #readInt16BE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readint16be_offset_noassert`
@Function #readInt32LE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readint32le_offset_noassert`
@Function #readInt32BE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readint32be_offset_noassert`
@Function #readFloatLE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readfloatle_offset_noassert`
@Function #readFloatBE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readfloatbe_offset_noassert`
@Function #readDoubleLE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readdoublele_offset_noassert`
@Function #readDoubleBE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_readdoublebe_offset_noassert`
@Function #writeUInt8
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeuint8_value_offset_noassert`
@Function #writeUInt16LE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeuint16le_value_offset_noassert`
@Function #writeUInt16BE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeuint16be_value_offset_noassert`
@Function #writeUInt32LE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeuint32le_value_offset_noassert`
@Function #writeUInt32BE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeuint32be_value_offset_noassert`
@Function #writeInt8
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeint8_value_offset_noassert`
@Function #writeInt16LE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeint16le_value_offset_noassert`
@Function #writeInt16BE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeint16be_value_offset_noassert`
@Function #writeInt32LE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeint32le_value_offset_noassert`
@Function #writeInt32BE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writeint32be_value_offset_noassert`
@Function #writeFloatLE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writefloatle_value_offset_noassert`
@Function #writeFloatBE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writefloatbe_value_offset_noassert`
@Function #writeDoubleLE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writedoublele_value_offset_noassert`
@Function #writeDoubleBE
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_writedoublebe_value_offset_noassert`
@Function #fill
    @remote `https://nodejs.org/api/buffer.html#buffer_buf_fill_value_offset_end`
*/
